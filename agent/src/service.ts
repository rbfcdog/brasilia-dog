import type { AgentAdapters, CatalogProduct, ConversationContextAdapter, ConversationMessage, ProductCatalogAdapter } from './adapters.js';
import type { AgentChatRequest, AgentChatResponse, ChatResponder } from './chat.js';
import type {
  PublicRun,
  ResumeRunRequest,
  StartRunRequest,
} from './contracts.js';
import { AgentError, toAgentError } from './errors.js';
import {
  createAgentGraph,
  consoleStepLogger,
  type AgentGraph,
  type AgentGraphResult,
  type StepLogger,
} from './graph.js';
import { RunStore } from './run-store.js';
import type { FlightSelector } from './selector.js';

type Scheduler = (operation: () => Promise<void>) => void;

const defaultScheduler: Scheduler = (operation) => {
  setImmediate(() => {
    void operation();
  });
};

const MAX_CONVERSATION_CONTEXT_CHARACTERS = 6_000;
const MAX_CONVERSATION_CONTEXT_MESSAGES = 20;

function formatConversationContext(messages: ConversationMessage[]): string {
  const selected = messages.slice(-MAX_CONVERSATION_CONTEXT_MESSAGES);
  const lines: string[] = [];
  let remaining = MAX_CONVERSATION_CONTEXT_CHARACTERS;

  for (const message of selected) {
    if (remaining <= 0) break;

    const prefix = `${message.role}: `;
    const content = message.content.slice(0, Math.max(0, remaining - prefix.length));
    lines.push(`${prefix}${content}`);
    remaining -= prefix.length + content.length + 1;
  }

  return lines.join('\n');
}

export class AgentService {
  readonly store: RunStore;
  private readonly graph: AgentGraph;
  private readonly conversations?: ConversationContextAdapter;
  private readonly products?: ProductCatalogAdapter;
  private readonly responder?: ChatResponder;
  private readonly schedule: Scheduler;
  constructor({
    adapters,
    selector,
    store = new RunStore(),
    logger = consoleStepLogger,
    responder,
    now,
    scheduler = defaultScheduler,
  }: {
    adapters: AgentAdapters;
    selector: FlightSelector;
    store?: RunStore;
    logger?: StepLogger;
    responder?: ChatResponder;
    now?: () => Date;
    scheduler?: Scheduler;
  }) {
    this.store = store;
    this.responder = responder;
    this.conversations = adapters.conversations;
    this.products = adapters.products;
    this.schedule = scheduler;
    this.graph = createAgentGraph({
      adapters,
      selector,
      store,
      logger,
      ...(now ? { now } : {}),
    });
  }

  start(idempotencyKey: string, request: StartRunRequest): PublicRun {
    const created = this.store.createOrGet(idempotencyKey, request);
    if (created.created) {
      this.schedule(async () => {
        await this.executeInitial(created.run.runId);
      });
    }
    return created.run;
  }

  get(runId: string): PublicRun {
    return this.store.require(runId);
  }

  resume(runId: string, idempotencyKey: string, request: ResumeRunRequest): PublicRun {
    const resume = this.store.beginResume(runId, idempotencyKey, request.approvalResolutionId);
    if (!resume.replay) {
      this.schedule(async () => {
        await this.executeResume(runId, idempotencyKey, request.approvalResolutionId);
      });
    }
    return resume.run;
  }

  async chat(request: AgentChatRequest): Promise<AgentChatResponse> {
    if (!this.responder) {
      throw new AgentError('CHAT_UNAVAILABLE', 'Chat is not configured for this agent service.', 503);
    }

    const conversationContext = request.conversationId
      ? await this.loadConversationContextForChat(request.conversationId)
      : undefined;
    return this.responder.respond({
      message: request.message,
      ...(conversationContext ? { conversationContext } : {}),
      ...(this.products ? { catalog: this.products } : {}),
    });
  }

  async listProducts(): Promise<CatalogProduct[]> {
    if (!this.products) {
      throw new AgentError('PRODUCT_CATALOG_UNAVAILABLE', 'The backend product catalog is not configured.', 503);
    }
    return this.products.listProducts();
  }

  private async executeInitial(runId: string): Promise<void> {
    try {
      const run = this.store.require(runId);
      this.store.setStatus(runId, 'running');
      this.store.appendEvent(runId, 'run_started');
      const conversationContext = run.conversationId
        ? await this.loadConversationContext(runId, run.conversationId)
        : undefined;
      const result = await this.graph.invokeInitial({
        runId,
        goal: run.goal,
        mandateId: run.mandateId,
        idempotencyKey: this.store.getStartIdempotencyKey(runId),
        ...(conversationContext ? { conversationContext } : {}),
      });
      this.consumeGraphResult(runId, result);
    } catch (error) {
      this.fail(runId, error);
    }
  }

  private async executeResume(runId: string, idempotencyKey: string, approvalResolutionId: string): Promise<void> {
    try {
      const result = await this.graph.resume(runId, { idempotencyKey, approvalResolutionId });
      this.consumeGraphResult(runId, result);
    } catch (error) {
      this.fail(runId, error);
    }
  }

  private consumeGraphResult(runId: string, state: AgentGraphResult): void {
    if (state.__interrupt__?.length) {
      if (state.verification?.outcome !== 'escalation_required') {
        throw new AgentError('GRAPH_STATE_INVALID', 'The graph interrupted without an approval request.');
      }
      this.store.markWaiting(runId, {
        attemptId: state.verification.attemptId,
        ...state.verification.approvalRequest,
      });
      return;
    }

    const terminal = state.terminal;
    if (!terminal) {
      throw new AgentError('GRAPH_STATE_INVALID', 'The graph finished without a terminal result.');
    }

    if (terminal.outcome === 'no_offer') {
      this.store.finish(runId, 'completed', {
        outcome: 'no_offer',
        message: 'No available flight offer was found.',
      });
      return;
    }

    const verification = terminal.verification;
    if (!verification) {
      throw new AgentError('GRAPH_STATE_INVALID', 'The terminal graph state is missing verification.');
    }

    if (verification.outcome === 'allowed') {
      this.store.appendEvent(runId, 'purchase_completed', {
        attemptId: verification.attemptId,
        receiptReference: verification.receipt.reference,
      });
      this.store.finish(runId, 'completed', {
        outcome: 'allowed',
        attemptId: verification.attemptId,
        receipt: verification.receipt,
      });
      return;
    }

    this.store.appendEvent(runId, 'purchase_rejected', {
      attemptId: verification.attemptId,
      reasonCode: verification.reasonCode,
    });
    this.store.finish(runId, 'rejected', {
      outcome: 'rejected',
      ...(verification.attemptId ? { attemptId: verification.attemptId } : {}),
      reasonCode: verification.reasonCode,
      message: verification.message,
    });
  }
  private async loadConversationContextForChat(conversationId: string): Promise<string | undefined> {
    if (!this.conversations) {
      throw new AgentError(
        'CONVERSATION_CONTEXT_UNAVAILABLE',
        'Conversation context requires a backend-connected agent adapter.',
        503,
      );
    }

    return formatConversationContext(
      await this.conversations.getConversationMessages(conversationId),
    ) || undefined;
  }


  private async loadConversationContext(runId: string, conversationId: string): Promise<string | undefined> {
    if (!this.conversations) {
      throw new AgentError(
        'CONVERSATION_CONTEXT_UNAVAILABLE',
        'Conversation context requires a backend-connected agent adapter.',
        503,
      );
    }

    const messages = await this.conversations.getConversationMessages(conversationId);
    const context = formatConversationContext(messages);
    this.store.appendEvent(runId, 'conversation_context_loaded', {
      conversationId,
      messageCount: messages.length,
    });
    return context || undefined;
  }

  private fail(runId: string, error: unknown): void {
    const failure = toAgentError(error);
    this.store.appendEvent(runId, 'run_failed', { code: failure.code });
    this.store.finish(runId, 'failed', {
      outcome: 'failed',
      code: failure.code,
      message: failure.message,
    });
  }
}
