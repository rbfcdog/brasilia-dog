import type { SupabaseClient } from '@supabase/supabase-js';

import type { AgentIdentity, AgentSigningKey } from '../domain/types.js';

interface AgentIdentityRow {
  id: string;
  owner_id: string;
  display_name: string;
  status: string;
  created_at: string;
}

interface SigningKeyRow {
  id: string;
  agent_identity_id: string;
  algorithm: string;
  public_key_jwk: JsonWebKey;
  public_key_fingerprint: string;
  status: string;
  not_before: string;
  not_after: string | null;
}

function mapIdentity(row: AgentIdentityRow): AgentIdentity {
  return {
    id: row.id,
    ownerId: row.owner_id,
    displayName: row.display_name,
    status: row.status as AgentIdentity['status'],
    createdAt: row.created_at,
  };
}

function mapKey(row: SigningKeyRow): AgentSigningKey {
  return {
    id: row.id,
    agentIdentityId: row.agent_identity_id,
    algorithm: 'Ed25519',
    publicKeyJwk: row.public_key_jwk,
    publicKeyFingerprint: row.public_key_fingerprint,
    status: row.status as AgentSigningKey['status'],
    notBefore: row.not_before,
    notAfter: row.not_after,
  };
}

export class AgentIdentityRepository {
  constructor(private readonly client: SupabaseClient) {}

  async createIdentity(ownerId: string, displayName: string): Promise<AgentIdentity> {
    const { data, error } = await this.client
      .from('agent_identities')
      .insert({ owner_id: ownerId, display_name: displayName })
      .select('id, owner_id, display_name, status, created_at')
      .single();

    if (error) {
      throw new Error('Could not create agent identity.');
    }

    return mapIdentity(data as AgentIdentityRow);
  }

  async ensureIdentity(params: {
    ownerId: string;
    displayName: string;
    publicKeyJwk: JsonWebKey;
    fingerprint: string;
  }): Promise<{ identity: AgentIdentity; signingKey: AgentSigningKey }> {
    const { data, error } = await this.client.rpc('ensure_agent_identity', {
      p_owner_id: params.ownerId,
      p_display_name: params.displayName,
      p_public_key_jwk: params.publicKeyJwk,
      p_public_key_fingerprint: params.fingerprint,
    });
    if (error || !data || typeof data !== 'object') throw new Error('Could not ensure agent identity.');
    const result = data as {
      identity: AgentIdentity;
      signingKey: Omit<AgentSigningKey, 'publicKeyFingerprint' | 'notBefore' | 'notAfter'> & { fingerprint: string };
    };
    return {
      identity: result.identity,
      signingKey: {
        ...result.signingKey,
        publicKeyFingerprint: result.signingKey.fingerprint,
        notBefore: new Date().toISOString(),
        notAfter: null,
      },
    };
  }

  async getIdentity(identityId: string): Promise<AgentIdentity | null> {
    const { data, error } = await this.client
      .from('agent_identities')
      .select('id, owner_id, display_name, status, created_at')
      .eq('id', identityId)
      .maybeSingle();

    if (error) {
      throw new Error('Could not load agent identity.');
    }

    return data ? mapIdentity(data as AgentIdentityRow) : null;
  }

  async listIdentities(ownerId: string): Promise<AgentIdentity[]> {
    const { data, error } = await this.client
      .from('agent_identities')
      .select('id, owner_id, display_name, status, created_at')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error('Could not list agent identities.');
    }

    return (data as AgentIdentityRow[]).map(mapIdentity);
  }

  async updateStatus(identityId: string, status: 'active' | 'suspended' | 'revoked'): Promise<void> {
    const update: Record<string, unknown> = { status };
    if (status === 'revoked') {
      update.revoked_at = new Date().toISOString();
    }

    const { error } = await this.client
      .from('agent_identities')
      .update(update)
      .eq('id', identityId);

    if (error) {
      throw new Error('Could not update agent identity status.');
    }
  }

  async addSigningKey(
    agentIdentityId: string,
    publicKeyJwk: JsonWebKey,
    fingerprint: string,
    keyReference: string,
  ): Promise<AgentSigningKey> {
    const { data, error } = await this.client
      .from('agent_signing_keys')
      .insert({
        agent_identity_id: agentIdentityId,
        algorithm: 'Ed25519',
        custody: 'agent_managed',
        key_reference: keyReference,
        public_key_jwk: publicKeyJwk,
        public_key_fingerprint: fingerprint,
      })
      .select('id, agent_identity_id, algorithm, public_key_jwk, public_key_fingerprint, status, not_before, not_after')
      .single();
    if (error) {
      throw new Error('Could not add agent signing key.');
    }

    return mapKey(data as SigningKeyRow);
  }

  async getActiveSigningKey(agentIdentityId: string): Promise<AgentSigningKey | null> {
    const { data, error } = await this.client
      .from('agent_signing_keys')
      .select('id, agent_identity_id, algorithm, public_key_jwk, public_key_fingerprint, status, not_before, not_after')
      .eq('agent_identity_id', agentIdentityId)
      .eq('status', 'active')
      .maybeSingle();

    if (error) {
      throw new Error('Could not load agent signing key.');
    }

    return data ? mapKey(data as SigningKeyRow) : null;
  }

  async getKeyByFingerprint(fingerprint: string): Promise<AgentSigningKey | null> {
    const { data, error } = await this.client
      .from('agent_signing_keys')
      .select('id, agent_identity_id, algorithm, public_key_jwk, public_key_fingerprint, status, not_before, not_after')
      .eq('public_key_fingerprint', fingerprint)
      .eq('status', 'active')
      .maybeSingle();

    if (error) {
      throw new Error('Could not load agent signing key.');
    }

    return data ? mapKey(data as SigningKeyRow) : null;
  }
}
