import { randomUUID } from 'node:crypto';
import type {
  PublicRun,
  RunEvent,
  RunEventType,
  RunStatus,
  StartRunRequest,
  TerminalResult,
} from './contracts.js';
import { sha256Utf8 } from './crypto.js';
import { AgentError } from './errors.js';

interface InternalRun extends PublicRun {
  startIdempotencyKey: string;
  startBodyHash: string;
}

interface ResumeIdempotencyRecord {
  runId: string;
  bodyHash: string;
}

export interface CreateRunResult {
  run: PublicRun;
  created: boolean;
}

export interface BeginResumeResult {
  run: PublicRun;
  replay: boolean;
}

export class RunStore {
  private readonly runs = new Map<string, InternalRun>();
  private readonly startIdempotency = new Map<string, string>();
  private readonly resumeIdempotency = new Map<string, ResumeIdempotencyRecord>();
  private readonly now: () => Date;

  constructor(now: () => Date = () => new Date()) {
    this.now = now;
  }

  createOrGet(idempotencyKey: string, request: StartRunRequest): CreateRunResult {
    const bodyHash = this.bodyHash(request);
    const existingRunId = this.startIdempotency.get(idempotencyKey);
    if (existingRunId) {
      const existing = this.requireInternal(existingRunId);
      if (existing.startBodyHash !== bodyHash) {
        throw new AgentError(
          'IDEMPOTENCY_CONFLICT',
          'The idempotency key was reused with a different request body.',
          409,
        );
      }
      return { run: this.toPublic(existing), created: false };
    }

    const timestamp = this.now().toISOString();
    const run: InternalRun = {
      runId: randomUUID(),
      status: 'queued',
      goal: request.goal,
      mandateId: request.mandateId,
      createdAt: timestamp,
      updatedAt: timestamp,
      events: [],
      startIdempotencyKey: idempotencyKey,
      startBodyHash: bodyHash,
    };
    this.runs.set(run.runId, run);
    this.startIdempotency.set(idempotencyKey, run.runId);
    return { run: this.toPublic(run), created: true };
  }

  get(runId: string): PublicRun | undefined {
    const run = this.runs.get(runId);
    return run ? this.toPublic(run) : undefined;
  }

  require(runId: string): PublicRun {
    return this.toPublic(this.requireInternal(runId));
  }

  getStartIdempotencyKey(runId: string): string {
    return this.requireInternal(runId).startIdempotencyKey;
  }

  setStatus(runId: string, status: RunStatus): void {
    const run = this.requireInternal(runId);
    run.status = status;
    run.updatedAt = this.now().toISOString();
  }

  appendEvent(runId: string, type: RunEventType, data: Record<string, unknown> = {}): RunEvent {
    const run = this.requireInternal(runId);
    const event: RunEvent = {
      sequence: run.events.length + 1,
      type,
      occurredAt: this.now().toISOString(),
      data: structuredClone(data),
    };
    run.events.push(event);
    run.updatedAt = event.occurredAt;
    return structuredClone(event);
  }

  markWaiting(runId: string, approvalRequest: NonNullable<PublicRun['approvalRequest']>): void {
    const run = this.requireInternal(runId);
    run.status = 'waiting_for_human';
    run.approvalRequest = structuredClone(approvalRequest);
    run.updatedAt = this.now().toISOString();
  }

  finish(runId: string, status: Extract<RunStatus, 'completed' | 'rejected' | 'failed'>, result: TerminalResult): void {
    const run = this.requireInternal(runId);
    run.status = status;
    run.result = structuredClone(result);
    delete run.approvalRequest;
    run.updatedAt = this.now().toISOString();
  }

  beginResume(runId: string, idempotencyKey: string, approvalResolutionId: string): BeginResumeResult {
    const bodyHash = this.bodyHash({ runId, approvalResolutionId });
    const existing = this.resumeIdempotency.get(idempotencyKey);
    if (existing) {
      if (existing.runId !== runId || existing.bodyHash !== bodyHash) {
        throw new AgentError(
          'IDEMPOTENCY_CONFLICT',
          'The resume idempotency key was reused with a different request.',
          409,
        );
      }
      return { run: this.require(runId), replay: true };
    }

    const run = this.requireInternal(runId);
    if (run.status !== 'waiting_for_human') {
      throw new AgentError('RUN_NOT_WAITING', 'Only a run waiting for human approval can be resumed.', 409);
    }

    this.resumeIdempotency.set(idempotencyKey, { runId, bodyHash });
    run.status = 'running';
    run.updatedAt = this.now().toISOString();
    return { run: this.toPublic(run), replay: false };
  }

  private requireInternal(runId: string): InternalRun {
    const run = this.runs.get(runId);
    if (!run) {
      throw new AgentError('RUN_NOT_FOUND', 'The agent run was not found.', 404);
    }
    return run;
  }

  private bodyHash(value: unknown): string {
    return sha256Utf8(JSON.stringify(value));
  }

  private toPublic(run: InternalRun): PublicRun {
    const {
      startIdempotencyKey: _startIdempotencyKey,
      startBodyHash: _startBodyHash,
      ...publicRun
    } = run;
    return structuredClone(publicRun);
  }
}
