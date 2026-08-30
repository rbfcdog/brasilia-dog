import { createHash, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

const ENROLLMENT_TTL_MS = 5 * 60_000;

export interface PasskeyEnrollmentAuthority {
  create(userId: string): Promise<{ token: string; expiresAt: string }>;
  resolve(token: string): Promise<{ userId: string; expiresAt: string } | null>;
  consume(token: string, userId: string): Promise<boolean>;
}

function hash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export class PasskeyEnrollmentService implements PasskeyEnrollmentAuthority {
  constructor(private readonly client: SupabaseClient) {}

  async create(userId: string): Promise<{ token: string; expiresAt: string }> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + ENROLLMENT_TTL_MS).toISOString();
    const { error } = await this.client.from('passkey_enrollment_grants').insert({
      token_hash: hash(token),
      user_id: userId,
      expires_at: expiresAt,
    });
    if (error) throw new Error(`Could not create passkey enrollment grant: ${error.message}. Apply migration 20260830050000_user_bound_passkey_enrollment.sql if the table is missing.`);
    return { token, expiresAt };
  }

  async resolve(token: string): Promise<{ userId: string; expiresAt: string } | null> {
    if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)) return null;
    const { data, error } = await this.client.from('passkey_enrollment_grants')
      .select('user_id, expires_at, consumed_at')
      .eq('token_hash', hash(token))
      .maybeSingle();
    if (error) throw new Error('Could not validate passkey enrollment grant.');
    if (!data || data.consumed_at || Date.parse(data.expires_at) <= Date.now()) return null;
    return { userId: data.user_id, expiresAt: data.expires_at };
  }

  async consume(token: string, userId: string): Promise<boolean> {
    const consumedAt = new Date().toISOString();
    const { data, error } = await this.client.from('passkey_enrollment_grants')
      .update({ consumed_at: consumedAt })
      .eq('token_hash', hash(token))
      .eq('user_id', userId)
      .is('consumed_at', null)
      .gt('expires_at', consumedAt)
      .select('token_hash')
      .maybeSingle();
    if (error) throw new Error('Could not consume passkey enrollment grant.');
    return Boolean(data);
  }
}

/**
 * Ephemeral enrollment grants for the sandbox deployment. Production keeps
 * using the Supabase-backed authority; the demo remains usable even when its
 * database role has not been provisioned for the durable passkey tables yet.
 */
export class InMemoryPasskeyEnrollmentService implements PasskeyEnrollmentAuthority {
  private readonly grants = new Map<string, { userId: string; expiresAt: string; consumed: boolean }>();

  async create(userId: string): Promise<{ token: string; expiresAt: string }> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + ENROLLMENT_TTL_MS).toISOString();
    this.grants.set(hash(token), { userId, expiresAt, consumed: false });
    return { token, expiresAt };
  }

  async resolve(token: string): Promise<{ userId: string; expiresAt: string } | null> {
    if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)) return null;
    const grant = this.grants.get(hash(token));
    if (!grant || grant.consumed || Date.parse(grant.expiresAt) <= Date.now()) return null;
    return { userId: grant.userId, expiresAt: grant.expiresAt };
  }

  async consume(token: string, userId: string): Promise<boolean> {
    const grant = this.grants.get(hash(token));
    if (!grant || grant.userId !== userId || grant.consumed || Date.parse(grant.expiresAt) <= Date.now()) {
      return false;
    }
    grant.consumed = true;
    return true;
  }
}
