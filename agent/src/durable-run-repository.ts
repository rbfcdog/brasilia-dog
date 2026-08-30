import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

import { canonicalJson } from './canonical-json.js';
import { AgentError } from './errors.js';
import type { MarketplaceRunState, MarketplaceRunStatus, PublicMarketplaceRun } from './marketplace-contracts.js';

interface RunRow {
  id: string;
  owner_id: string;
  mandate_id: string;
  goal: string;
  conversation_id: string | null;
  status: MarketplaceRunStatus;
  start_idempotency_key: string;
  start_body_sha256: string;
  next_poll_at: string | null;
  lease_owner: string | null;
  lease_until: string | null;
  state: MarketplaceRunState;
  result: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

interface EventRow {
  sequence: number;
  type: string;
  data: Record<string, unknown>;
  occurred_at: string;
}

const RUN_SELECT = 'id,owner_id,mandate_id,goal,conversation_id,status,start_idempotency_key,start_body_sha256,next_poll_at,lease_owner,lease_until,state,result,created_at,updated_at';

export class DurableRunRepository {
  constructor(private readonly client: SupabaseClient) {}

  async createOrGet(input: {
    ownerId: string;
    mandateId: string;
    goal: string;
    conversationId?: string;
    agentIdentityId: string;
    agentSigningKeyId: string;
    idempotencyKey: string;
  }): Promise<PublicMarketplaceRun> {
    const bodySha256 = createHash('sha256').update(canonicalJson(input)).digest('hex');
    const state: MarketplaceRunState = {
      agentIdentityId: input.agentIdentityId,
      agentSigningKeyId: input.agentSigningKeyId,
      candidates: [],
      authorityChecks: [],
    };
    const { data, error } = await this.client.from('agent_runs').insert({
      owner_id: input.ownerId,
      mandate_id: input.mandateId,
      goal: input.goal,
      conversation_id: input.conversationId ?? null,
      start_idempotency_key: input.idempotencyKey,
      start_body_sha256: bodySha256,
      next_poll_at: new Date().toISOString(),
      state,
    }).select(RUN_SELECT).single();

    let row = data as RunRow | null;
    if (error) {
      if (error.code !== '23505') throw new AgentError('RUN_PERSISTENCE_FAILED', 'Could not create the durable run.', 500, { cause: error });
      const existing = await this.client.from('agent_runs').select(RUN_SELECT)
        .eq('owner_id', input.ownerId).eq('start_idempotency_key', input.idempotencyKey).maybeSingle();
      if (existing.error || !existing.data) throw new AgentError('RUN_PERSISTENCE_FAILED', 'Could not recover the idempotent run.', 500);
      row = existing.data as RunRow;
      if (row.start_body_sha256 !== bodySha256) {
        throw new AgentError('IDEMPOTENCY_CONFLICT', 'The idempotency key was used with a different run request.', 409);
      }
    } else if (row) {
      await this.appendEvent(row.id, 'run_queued', { mandateId: row.mandate_id });
    }
    if (!row) throw new AgentError('RUN_PERSISTENCE_FAILED', 'The durable run was not returned.', 500);
    return this.publicRun(row);
  }

  async get(runId: string): Promise<PublicMarketplaceRun> {
    const { data, error } = await this.client.from('agent_runs').select(RUN_SELECT).eq('id', runId).maybeSingle();
    if (error) throw new AgentError('RUN_PERSISTENCE_FAILED', 'Could not load the run.', 500);
    if (!data) throw new AgentError('RUN_NOT_FOUND', 'Run not found.', 404);
    return this.publicRun(data as RunRow);
  }

  async list(ownerId: string): Promise<PublicMarketplaceRun[]> {
    const { data, error } = await this.client.from('agent_runs').select(RUN_SELECT)
      .eq('owner_id', ownerId).order('created_at', { ascending: false }).limit(50);
    if (error) throw new AgentError('RUN_PERSISTENCE_FAILED', 'Could not list runs.', 500);
    return Promise.all((data as RunRow[]).map((row) => this.publicRun(row)));
  }

  async claim(workerId: string, limit = 5): Promise<RunRow[]> {
    const { data, error } = await this.client.rpc('claim_due_agent_runs', {
      p_worker_id: workerId,
      p_limit: limit,
      p_lease_seconds: 20,
    });
    if (error) throw new AgentError('RUN_CLAIM_FAILED', 'Could not claim due runs.', 500, { cause: error });
    return (data ?? []) as RunRow[];
  }

  async transition(runId: string, update: {
    status: MarketplaceRunStatus;
    state: MarketplaceRunState;
    nextPollAt?: string | null;
    result?: Record<string, unknown> | null;
  }): Promise<void> {
    const payload: Record<string, unknown> = {
      status: update.status,
      state: update.state,
      next_poll_at: update.nextPollAt ?? null,
      lease_owner: null,
      lease_until: null,
      updated_at: new Date().toISOString(),
    };
    if ('result' in update) payload.result = update.result ?? null;
    const { error } = await this.client.from('agent_runs').update(payload).eq('id', runId);
    if (error) throw new AgentError('RUN_PERSISTENCE_FAILED', 'Could not update the durable run.', 500, { cause: error });
  }

  async appendEvent(runId: string, type: string, data: Record<string, unknown> = {}): Promise<void> {
    const { error } = await this.client.rpc('append_agent_run_event', {
      p_run_id: runId,
      p_type: type,
      p_data: data,
    });
    if (error) throw new AgentError('RUN_PERSISTENCE_FAILED', 'Could not append the run event.', 500, { cause: error });
  }

  async resume(runId: string, idempotencyKey: string, extensionId: string): Promise<PublicMarketplaceRun> {
    const current = await this.get(runId);
    if (current.status !== 'waiting_for_extension') {
      if (current.extensionId === extensionId) return current;
      throw new AgentError('RUN_NOT_WAITING', 'The run is not waiting for an extension.', 409);
    }
    const extension = await this.client.from('mandate_extensions')
      .select('id,run_id,mandate_id,owner_id,new_version,new_expires_at,idempotency_key')
      .eq('id', extensionId).maybeSingle();
    if (extension.error || !extension.data) throw new AgentError('EXTENSION_NOT_FOUND', 'The mandate extension was not found.', 404);
    const row = extension.data as Record<string, unknown>;
    if (row.run_id !== runId || row.mandate_id !== current.mandateId || row.owner_id !== current.ownerId || row.idempotency_key !== idempotencyKey) {
      throw new AgentError('EXTENSION_MISMATCH', 'The extension does not belong to this run and idempotency key.', 409);
    }
    const loaded = await this.getRow(runId);
    const state = { ...loaded.state, extensionId, extensionRequest: undefined };
    await this.appendEvent(runId, 'mandate_extended', {
      extensionId,
      version: row.new_version,
      expiresAt: row.new_expires_at,
    });
    await this.transition(runId, { status: 'queued', state, nextPollAt: new Date().toISOString(), result: null });
    return this.get(runId);
  }

  private async getRow(runId: string): Promise<RunRow> {
    const { data, error } = await this.client.from('agent_runs').select(RUN_SELECT).eq('id', runId).single();
    if (error) throw new AgentError('RUN_NOT_FOUND', 'Run not found.', 404);
    return data as RunRow;
  }

  private async publicRun(row: RunRow): Promise<PublicMarketplaceRun> {
    const { data, error } = await this.client.from('agent_run_events')
      .select('sequence,type,data,occurred_at').eq('run_id', row.id).order('sequence', { ascending: true });
    if (error) throw new AgentError('RUN_PERSISTENCE_FAILED', 'Could not load run events.', 500);
    const state = row.state;
    return {
      runId: row.id,
      ownerId: row.owner_id,
      status: row.status,
      goal: row.goal,
      mandateId: row.mandate_id,
      ...(row.conversation_id ? { conversationId: row.conversation_id } : {}),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      ...(row.next_poll_at ? { nextPollAt: row.next_poll_at } : {}),
      events: (data as EventRow[]).map((event) => ({
        sequence: event.sequence, type: event.type, data: event.data, occurredAt: event.occurred_at,
      })),
      ...(state.mandate ? { mandate: state.mandate } : {}),
      candidates: state.candidates,
      ...(state.selectedProduct ? { selectedProduct: state.selectedProduct } : {}),
      authorityChecks: state.authorityChecks,
      ...(state.extensionRequest ? { extensionRequest: state.extensionRequest } : {}),
      ...(state.extensionId ? { extensionId: state.extensionId } : {}),
      ...(state.proofId ? { proofId: state.proofId } : {}),
      ...(state.paymentAttempt ? { paymentAttempt: state.paymentAttempt } : {}),
      ...(state.receipt ? { receipt: state.receipt } : {}),
      ...(row.result ? { result: row.result } : {}),
    };
  }
}

export type ClaimedMarketplaceRun = RunRow;
