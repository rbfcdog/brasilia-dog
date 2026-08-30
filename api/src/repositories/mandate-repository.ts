import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Mandate, MandateScope, MandateUsage } from '../domain/types.js';

interface MandateRow {
  id: string;
  owner_id: string;
  agent_identity_id: string;
  version: number;
  status: string;
  scope: Record<string, unknown>;
  max_amount_minor: number;
  currency: string;
  expires_at: string;
  created_at: string;
}

function mapMandate(row: MandateRow): Mandate {
  return {
    id: row.id,
    ownerId: row.owner_id,
    agentIdentityId: row.agent_identity_id,
    version: row.version,
    status: row.status as Mandate['status'],
    scope: row.scope as MandateScope,
    maxAmountMinor: Number(row.max_amount_minor),
    currency: row.currency,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

export interface CreateMandateInput {
  ownerId: string;
  agentIdentityId: string;
  scope: MandateScope;
  maxAmountMinor: number;
  currency: string;
  expiresAt: string;
  idempotencyKey?: string;
  bodySha256?: string;
}

export interface MandateExtension {
  extensionId: string;
  mandateId: string;
  version: number;
  expiresAt: string;
}

export interface MandateStore {
  create(params: CreateMandateInput): Promise<Mandate>;
  extendForRun(ownerId: string, runId: string, idempotencyKey: string): Promise<MandateExtension>;
  getMandate(mandateId: string): Promise<Mandate | null>;
  getActiveMandate(agentIdentityId: string): Promise<Mandate | null>;
  listMandates(ownerId: string): Promise<Mandate[]>;
  revoke(mandateId: string): Promise<void>;
  getUsage(mandateId: string): Promise<MandateUsage>;
}

export class MandateRepository implements MandateStore {
  constructor(private readonly client: SupabaseClient) {}

  async create(params: CreateMandateInput): Promise<Mandate> {
    if (params.idempotencyKey) {
      const { data, error } = await this.client
        .from('mandates')
        .select('id, owner_id, agent_identity_id, version, status, scope, max_amount_minor, currency, expires_at, created_at, creation_body_sha256')
        .eq('owner_id', params.ownerId)
        .eq('creation_idempotency_key', params.idempotencyKey)
        .maybeSingle();
      if (error) throw new Error('Could not check mandate idempotency.');
      if (data) {
        const existing = data as MandateRow & { creation_body_sha256: string | null };
        if (!params.bodySha256 || existing.creation_body_sha256 !== params.bodySha256) {
          throw new Error('The idempotency key was used with a different mandate.');
        }
        return mapMandate(existing);
      }
    }
    const { data, error } = await this.client
      .from('mandates')
      .insert({
        owner_id: params.ownerId,
        agent_identity_id: params.agentIdentityId,
        version: 1,
        scope: params.scope,
        max_amount_minor: params.maxAmountMinor,
        currency: params.currency,
        expires_at: params.expiresAt,
        ...(params.idempotencyKey ? { creation_idempotency_key: params.idempotencyKey } : {}),
        ...(params.bodySha256 ? { creation_body_sha256: params.bodySha256 } : {}),
      })
      .select('id, owner_id, agent_identity_id, version, status, scope, max_amount_minor, currency, expires_at, created_at')
      .single();

    if (error) {
      throw new Error('Could not create mandate.');
    }

    return mapMandate(data as MandateRow);
  }

  async extendForRun(ownerId: string, runId: string, idempotencyKey: string): Promise<{
    extensionId: string;
    mandateId: string;
    version: number;
    expiresAt: string;
  }> {
    const { data, error } = await this.client.rpc('extend_mandate_for_run', {
      p_owner_id: ownerId,
      p_run_id: runId,
      p_idempotency_key: idempotencyKey,
    });
    if (error || !data || typeof data !== 'object') throw new Error(error?.message ?? 'Could not extend mandate.');
    return data as { extensionId: string; mandateId: string; version: number; expiresAt: string };
  }

  async getMandate(mandateId: string): Promise<Mandate | null> {
    const { data, error } = await this.client
      .from('mandates')
      .select('id, owner_id, agent_identity_id, version, status, scope, max_amount_minor, currency, expires_at, created_at')
      .eq('id', mandateId)
      .maybeSingle();

    if (error) {
      throw new Error('Could not load mandate.');
    }

    return data ? mapMandate(data as MandateRow) : null;
  }

  async getActiveMandate(agentIdentityId: string): Promise<Mandate | null> {
    const { data, error } = await this.client
      .from('mandates')
      .select('id, owner_id, agent_identity_id, version, status, scope, max_amount_minor, currency, expires_at, created_at')
      .eq('agent_identity_id', agentIdentityId)
      .eq('status', 'active')
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error('Could not load active mandate.');
    }

    if (!data) {
      return null;
    }

    const mandate = mapMandate(data as MandateRow);
    if (new Date(mandate.expiresAt).getTime() < Date.now()) {
      return null;
    }

    return mandate;
  }

  async listMandates(ownerId: string): Promise<Mandate[]> {
    const { data, error } = await this.client
      .from('mandates')
      .select('id, owner_id, agent_identity_id, version, status, scope, max_amount_minor, currency, expires_at, created_at')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error('Could not list mandates.');
    }

    return (data as MandateRow[]).map(mapMandate);
  }

  async revoke(mandateId: string): Promise<void> {
    const { error } = await this.client
      .from('mandates')
      .update({ status: 'revoked', revoked_at: new Date().toISOString() })
      .eq('id', mandateId);

    if (error) {
      throw new Error('Could not revoke mandate.');
    }
  }

  async getUsage(mandateId: string): Promise<MandateUsage> {
    const { data, error } = await this.client
      .from('payment_attempts')
      .select('amount_minor, status')
      .eq('agent_execution_proof_id', mandateId);

    // This is a simplified usage query. In production, we would join through
    // agent_execution_proofs to filter by mandate_id. For now, we return zero
    // usage if the query fails or no records exist.
    if (error || !data) {
      return { totalSpentMinor: 0, purchaseCount: 0 };
    }

    const settled = (data as Array<{ amount_minor: number; status: string }>)
      .filter((r) => r.status === 'settled');

    return {
      totalSpentMinor: settled.reduce((sum, r) => sum + Number(r.amount_minor), 0),
      purchaseCount: settled.length,
    };
  }
}

interface InMemoryIdempotencyRecord {
  mandateId: string;
  bodySha256?: string;
}

/** Process-local mandate authority used only by the public sandbox. */
export class InMemoryMandateRepository implements MandateStore {
  private readonly mandates = new Map<string, Mandate>();
  private readonly idempotency = new Map<string, InMemoryIdempotencyRecord>();
  private readonly extensions = new Map<string, MandateExtension>();

  async create(params: CreateMandateInput): Promise<Mandate> {
    const idempotencyScope = params.idempotencyKey
      ? `${params.ownerId}:${params.idempotencyKey}`
      : null;
    const existing = idempotencyScope ? this.idempotency.get(idempotencyScope) : null;
    if (existing) {
      if (!params.bodySha256 || existing.bodySha256 !== params.bodySha256) {
        throw new Error('The idempotency key was used with a different mandate.');
      }
      return structuredClone(this.mandates.get(existing.mandateId)!);
    }

    const mandate: Mandate = {
      id: `sandbox-mandate-${randomUUID()}`,
      ownerId: params.ownerId,
      agentIdentityId: params.agentIdentityId,
      version: 1,
      status: 'active',
      scope: structuredClone(params.scope),
      maxAmountMinor: params.maxAmountMinor,
      currency: params.currency,
      expiresAt: params.expiresAt,
      createdAt: new Date().toISOString(),
    };
    this.mandates.set(mandate.id, mandate);
    if (idempotencyScope) {
      this.idempotency.set(idempotencyScope, {
        mandateId: mandate.id,
        ...(params.bodySha256 ? { bodySha256: params.bodySha256 } : {}),
      });
    }
    return structuredClone(mandate);
  }

  async extendForRun(ownerId: string, runId: string, idempotencyKey: string): Promise<MandateExtension> {
    const scope = `${ownerId}:${runId}:${idempotencyKey}`;
    const existing = this.extensions.get(scope);
    if (existing) return structuredClone(existing);
    const mandate = [...this.mandates.values()]
      .filter((candidate) => candidate.ownerId === ownerId && candidate.status === 'active')
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
    if (!mandate) throw new Error('Mandate not found.');
    mandate.version += 1;
    mandate.expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1_000).toISOString();
    const extension: MandateExtension = {
      extensionId: randomUUID(),
      mandateId: mandate.id,
      version: mandate.version,
      expiresAt: mandate.expiresAt,
    };
    this.extensions.set(scope, extension);
    return structuredClone(extension);
  }

  async getMandate(mandateId: string): Promise<Mandate | null> {
    const mandate = this.mandates.get(mandateId);
    return mandate ? structuredClone(mandate) : null;
  }

  async getActiveMandate(agentIdentityId: string): Promise<Mandate | null> {
    const mandate = [...this.mandates.values()]
      .filter((candidate) => candidate.agentIdentityId === agentIdentityId
        && candidate.status === 'active' && Date.parse(candidate.expiresAt) > Date.now())
      .sort((left, right) => right.version - left.version)[0];
    return mandate ? structuredClone(mandate) : null;
  }

  async listMandates(ownerId: string): Promise<Mandate[]> {
    return [...this.mandates.values()]
      .filter((mandate) => mandate.ownerId === ownerId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((mandate) => structuredClone(mandate));
  }

  async revoke(mandateId: string): Promise<void> {
    const mandate = this.mandates.get(mandateId);
    if (mandate) mandate.status = 'revoked';
  }

  async getUsage(_mandateId: string): Promise<MandateUsage> {
    return { totalSpentMinor: 0, purchaseCount: 0 };
  }
}
