import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
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
  private readonly persistencePath?: string;

  constructor(now: () => Date = () => new Date(), persistencePath?: string) {
    this.now = now;
    this.persistencePath = persistencePath;
    this.load();
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
      ...(request.conversationId ? { conversationId: request.conversationId } : {}),
      createdAt: timestamp,
      updatedAt: timestamp,
      events: [],
      startIdempotencyKey: idempotencyKey,
      startBodyHash: bodyHash,
    };
    this.runs.set(run.runId, run);
    this.startIdempotency.set(idempotencyKey, run.runId);
    this.save();
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
    this.save();
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
    this.save();
    return structuredClone(event);
  }

  markWaiting(runId: string, approvalRequest: NonNullable<PublicRun['approvalRequest']>): void {
    const run = this.requireInternal(runId);
    run.status = 'waiting_for_human';
    run.approvalRequest = structuredClone(approvalRequest);
    run.updatedAt = this.now().toISOString();
    this.save();
  }

  finish(runId: string, status: Extract<RunStatus, 'completed' | 'rejected' | 'failed'>, result: TerminalResult): void {
    const run = this.requireInternal(runId);
    run.status = status;
    run.result = structuredClone(result);
    delete run.approvalRequest;
    run.updatedAt = this.now().toISOString();
    this.save();
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
    this.save();
    return { run: this.toPublic(run), replay: false };
  }

  private requireInternal(runId: string): InternalRun {
    const run = this.runs.get(runId);
    this.save();
    if (!run) {
      throw new AgentError('RUN_NOT_FOUND', 'The agent run was not found.', 404);
    }
    return run;
  }

  private load(): void {
    if (!this.persistencePath || !existsSync(this.persistencePath)) return;
    try {
      const data = JSON.parse(readFileSync(this.persistencePath, 'utf8')) as {
        runs?: InternalRun[];
        startIdempotency?: [string, string][];
        resumeIdempotency?: [string, ResumeIdempotencyRecord][];
      };
      for (const run of data.runs ?? []) this.runs.set(run.runId, run);
      for (const entry of data.startIdempotency ?? []) this.startIdempotency.set(...entry);
      for (const entry of data.resumeIdempotency ?? []) this.resumeIdempotency.set(...entry);
    } catch {
      // A corrupt cache must not prevent the service from starting.
    }
  }

  private save(): void {
    if (!this.persistencePath) return;
    try {
      mkdirSync(dirname(this.persistencePath), { recursive: true });
      writeFileSync(this.persistencePath, JSON.stringify({
        runs: [...this.runs.values()],
        startIdempotency: [...this.startIdempotency.entries()],
        resumeIdempotency: [...this.resumeIdempotency.entries()],
      }), 'utf8');
    } catch (error) {
      console.error('Agent run persistence unavailable.', {
        path: this.persistencePath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
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
