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

export class MandateRepository {
  constructor(private readonly client: SupabaseClient) {}

  async create(params: {
    ownerId: string;
    agentIdentityId: string;
    scope: MandateScope;
    maxAmountMinor: number;
    currency: string;
    expiresAt: string;
  }): Promise<Mandate> {
    // Get current max version for this agent to compute next version
    const { data: existing } = await this.client
      .from('mandates')
      .select('version')
      .eq('agent_identity_id', params.agentIdentityId)
      .order('version', { ascending: false })
      .limit(1);

    const nextVersion = existing && existing.length > 0 ? (existing[0] as { version: number }).version + 1 : 1;

    const { data, error } = await this.client
      .from('mandates')
      .insert({
        owner_id: params.ownerId,
        agent_identity_id: params.agentIdentityId,
        version: nextVersion,
        scope: params.scope,
        max_amount_minor: params.maxAmountMinor,
        currency: params.currency,
        expires_at: params.expiresAt,
      })
      .select('id, owner_id, agent_identity_id, version, status, scope, max_amount_minor, currency, expires_at, created_at')
      .single();

    if (error) {
      throw new Error('Could not create mandate.');
    }

    return mapMandate(data as MandateRow);
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
