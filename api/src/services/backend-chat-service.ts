import type { ConversationRepository } from '../repositories/conversation-repository.js';

interface ChatInput {
  message: string;
  conversationId?: string;
}

interface AgentEnvelope {
  ok: true;
  data: Record<string, unknown> & { kind: string; message: string };
}

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

function parseAgentEnvelope(value: unknown): AgentEnvelope {
  if (!isRecord(value) || value.ok !== true || !isRecord(value.data)) {
    throw new BackendChatError('The agent returned an invalid response.', 'INVALID_AGENT_RESPONSE', 502);
  }
  const { kind, message } = value.data;
  if (!['clarification', 'products', 'mandate'].includes(String(kind)) || typeof message !== 'string' || !message.trim()) {
    throw new BackendChatError('The agent returned an invalid response.', 'INVALID_AGENT_RESPONSE', 502);
  }
  if (kind === 'mandate' && !isRecord(value.data.mandate)) {
    throw new BackendChatError('The agent returned an invalid mandate proposal.', 'INVALID_AGENT_RESPONSE', 502);
  }
  return { ok: true, data: { ...value.data, kind, message: message.trim() } as AgentEnvelope['data'] };
}

export class BackendChatService {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly agentServiceUrl: string,
    private readonly agentServiceOutboundToken: string,
    private readonly request: typeof fetch = fetch,
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
    const envelope = parseAgentEnvelope(payload);
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
