import type { AgentAdapters } from './adapters.js';
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

export class AgentService {
  readonly store: RunStore;
  private readonly graph: AgentGraph;
  private readonly schedule: Scheduler;

  constructor({
    adapters,
    selector,
    store = new RunStore(),
    logger = consoleStepLogger,
    now,
    scheduler = defaultScheduler,
  }: {
    adapters: AgentAdapters;
    selector: FlightSelector;
    store?: RunStore;
    logger?: StepLogger;
    now?: () => Date;
    scheduler?: Scheduler;
  }) {
    this.store = store;
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

  private async executeInitial(runId: string): Promise<void> {
    try {
      const run = this.store.require(runId);
      this.store.setStatus(runId, 'running');
      this.store.appendEvent(runId, 'run_started');
      const result = await this.graph.invokeInitial({
        runId,
        goal: run.goal,
        mandateId: run.mandateId,
        idempotencyKey: this.store.getStartIdempotencyKey(runId),
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
