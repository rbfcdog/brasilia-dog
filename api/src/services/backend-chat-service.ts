import type { ConversationStore } from '../repositories/conversation-repository.js';
import {
  AgentRefundError,
  type AgentRefundIntent,
  type AgentRefundResult,
  type AgentRefundService,
} from './agent-refund-service.js';

interface ChatInput {
  message: string;
  conversationId?: string;
}

interface AgentEnvelope {
  ok: true;
  data: Record<string, unknown> & { kind: string; message: string };
}

const REFUND_REASONS = new Set(['duplicate', 'fraudulent', 'requested_by_customer']);

export class BackendChatError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'BackendChatError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseRefundIntent(value: unknown): AgentRefundIntent {
  if (!isRecord(value)) {
    throw new BackendChatError('The agent returned an invalid refund request.', 'INVALID_AGENT_RESPONSE', 502);
  }
  const selection = value.selection;
  const paymentAttemptId = value.paymentAttemptId;
  const reason = value.reason;
  if (
    (selection !== 'latest' && selection !== 'payment')
    || (paymentAttemptId !== null && typeof paymentAttemptId !== 'string')
    || (selection === 'payment' && (typeof paymentAttemptId !== 'string' || !paymentAttemptId.trim()))
    || (selection === 'latest' && paymentAttemptId !== null)
    || typeof reason !== 'string'
    || !REFUND_REASONS.has(reason)
  ) {
    throw new BackendChatError('The agent returned an invalid refund request.', 'INVALID_AGENT_RESPONSE', 502);
  }
  return {
    selection,
    paymentAttemptId: paymentAttemptId === null ? null : paymentAttemptId.trim(),
    reason: reason as AgentRefundIntent['reason'],
  };
}

function refundMessage(refund: AgentRefundResult): string {
  const amount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: refund.currency.toUpperCase(),
  }).format(refund.amount / (10 ** refund.scale));
  const outcome = refund.status === 'succeeded' ? 'completed' : 'submitted';
  return `Your refund was ${outcome} with Stripe for ${amount}. Refund reference: ${refund.id}.`;
}

function publicRefund(refund: AgentRefundResult): Record<string, unknown> {
  return {
    id: refund.id,
    paymentAttemptId: refund.paymentAttemptId,
    amount: refund.amount,
    currency: refund.currency,
    scale: refund.scale,
    status: refund.status,
    reason: refund.reason,
  };
}

function parseAgentEnvelope(value: unknown): AgentEnvelope {
  if (!isRecord(value) || value.ok !== true || !isRecord(value.data)) {
    throw new BackendChatError('The agent returned an invalid response.', 'INVALID_AGENT_RESPONSE', 502);
  }
  const { kind, message } = value.data;
  if (!['clarification', 'products', 'mandate', 'refund'].includes(String(kind)) || typeof message !== 'string' || !message.trim()) {
    throw new BackendChatError('The agent returned an invalid response.', 'INVALID_AGENT_RESPONSE', 502);
  }
  if (kind === 'mandate' && !isRecord(value.data.mandate)) {
    throw new BackendChatError('The agent returned an invalid mandate proposal.', 'INVALID_AGENT_RESPONSE', 502);
  }
  if (kind === 'refund') parseRefundIntent(value.data.refund);
  return { ok: true, data: { ...value.data, kind, message: message.trim() } as AgentEnvelope['data'] };
}

export class BackendChatService {
  constructor(
    private readonly conversations: ConversationStore,
    private readonly agentServiceUrl: string,
    private readonly agentServiceOutboundToken: string,
    private readonly request: typeof fetch = fetch,
    private readonly refunds: AgentRefundService | null = null,
  ) {}

  async chat(userId: string, input: ChatInput): Promise<AgentEnvelope> {
    const conversation = input.conversationId
      ? await this.conversations.getConversation(input.conversationId)
      : await this.conversations.createConversation(userId);
    if (!conversation || conversation.ownerId !== userId) {
      throw new BackendChatError('Conversation not found.', 'CONVERSATION_NOT_FOUND', 404);
    }

    const userCreatedAt = new Date().toISOString();
    await this.conversations.appendMessage({
      conversationId: conversation.id,
      ownerId: userId,
      role: 'user',
      content: input.message,
      createdAt: userCreatedAt,
    });

    let response: Response;
    try {
      response = await this.request(new URL('/v1/chat', this.agentServiceUrl), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.agentServiceOutboundToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: input.message, conversationId: conversation.id }),
        signal: AbortSignal.timeout(25_000),
      });
    } catch {
      throw new BackendChatError('The agent service could not be reached.', 'AGENT_UNAVAILABLE', 502);
    }

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const agentError = isRecord(payload) && isRecord(payload.error) ? payload.error : null;
      if (
        typeof agentError?.code === 'string'
        && agentError.code.length > 0
        && typeof agentError.message === 'string'
        && agentError.message.length > 0
      ) {
        throw new BackendChatError(
          agentError.message,
          agentError.code,
          response.status >= 400 && response.status < 600 ? response.status : 502,
        );
      }
      throw new BackendChatError('The agent service rejected the request.', 'AGENT_UNAVAILABLE', 502);
    }
    let envelope = parseAgentEnvelope(payload);
    if (envelope.data.kind === 'refund') {
      if (userId === 'anon') {
        throw new BackendChatError(
          'Sign in before asking the agent to refund a payment.',
          'REFUND_AUTHENTICATION_REQUIRED',
          401,
        );
      }
      if (!this.refunds) {
        throw new BackendChatError(
          'Refund processing is temporarily unavailable.',
          'REFUND_SERVICE_UNAVAILABLE',
          503,
        );
      }
      try {
        const refund = await this.refunds.refund(userId, parseRefundIntent(envelope.data.refund));
        envelope = {
          ok: true,
          data: {
            ...envelope.data,
            message: refundMessage(refund),
            refund: publicRefund(refund),
          },
        };
      } catch (error) {
        if (error instanceof AgentRefundError) {
          throw new BackendChatError(error.message, error.code, error.status);
        }
        console.error('Agent refund orchestration failed.', error instanceof Error ? error.message : String(error));
        throw new BackendChatError(
          'Refund processing is temporarily unavailable.',
          'REFUND_SERVICE_UNAVAILABLE',
          503,
        );
      }
    }
    const assistantCreatedAt = new Date().toISOString();

    await this.conversations.appendMessage({
      conversationId: conversation.id,
      ownerId: userId,
      role: 'assistant',
      content: envelope.data.message,
      createdAt: assistantCreatedAt,
    });
    try {
      await this.conversations.appendEvent({
        conversationId: conversation.id,
        ownerId: userId,
        type: 'agent_response',
        payload: envelope.data,
        createdAt: assistantCreatedAt,
      });
      if (envelope.data.kind === 'mandate' && isRecord(envelope.data.mandate)) {
        await this.conversations.appendEvent({
          conversationId: conversation.id,
          ownerId: userId,
          type: 'mandate_proposed',
          payload: envelope.data.mandate,
          createdAt: assistantCreatedAt,
        });
      }
      if (envelope.data.kind === 'refund' && isRecord(envelope.data.refund)) {
        await this.conversations.appendEvent({
          conversationId: conversation.id,
          ownerId: userId,
          type: 'refund_processed',
          payload: envelope.data.refund,
          createdAt: assistantCreatedAt,
        });
      }
    } catch (error) {
      // Event storage must not turn a valid chat response into a user-visible
      // failure. The assistant message is already committed; log the retry
      // signal while the event writer/migration is unavailable.
      console.error('Conversation event persistence failed.', {
        conversationId: conversation.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return { ok: true, data: { ...envelope.data, conversationId: conversation.id } };
  }
}
