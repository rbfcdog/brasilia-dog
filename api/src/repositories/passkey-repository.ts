import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { PasskeySession } from '../domain/types.js';
import type { PasskeyCredentialRecord, PasskeyStore } from '../services/passkey-service.js';
import type { SessionStore } from '../services/session-service.js';

function bytea(buffer: Buffer): string {
  return `\\x${buffer.toString('hex')}`;
}

function buffer(value: unknown): Buffer {
  if (typeof value !== 'string') throw new Error('Stored passkey public key is invalid.');
  return Buffer.from(value.startsWith('\\x') ? value.slice(2) : value, 'hex');
}

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export class SupabasePasskeyStore implements PasskeyStore {
  constructor(private readonly client: SupabaseClient) {}

  async saveCredential(userId: string, credential: PasskeyCredentialRecord): Promise<void> {
    const { error } = await this.client.from('passkey_credentials').upsert({
      user_id: userId,
      credential_id: credential.credentialId,
      public_key: bytea(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports,
      device_type: credential.deviceType ?? null,
      backed_up: credential.backedUp,
    }, { onConflict: 'credential_id' });
    if (error) throw new Error('Could not save passkey credential.');
  }

  async getCredential(userId: string, credentialId: string): Promise<PasskeyCredentialRecord | null> {
    const { data, error } = await this.client.from('passkey_credentials')
      .select('id, credential_id, public_key, counter, transports, device_type, backed_up')
      .eq('user_id', userId).eq('credential_id', credentialId).maybeSingle();
    if (error) throw new Error('Could not load passkey credential.');
    return data ? this.mapCredential(data) : null;
  }

  async listCredentials(userId: string): Promise<PasskeyCredentialRecord[]> {
    const { data, error } = await this.client.from('passkey_credentials')
      .select('id, credential_id, public_key, counter, transports, device_type, backed_up')
      .eq('user_id', userId);
    if (error) throw new Error('Could not list passkey credentials.');
    return (data ?? []).map((row) => this.mapCredential(row));
  }

  async updateCounter(userId: string, credentialId: string, counter: number): Promise<void> {
    const { error } = await this.client.from('passkey_credentials').update({ counter })
      .eq('user_id', userId).eq('credential_id', credentialId);
    if (error) throw new Error('Could not update passkey counter.');
  }

  async getCurrentChallenge(userId: string): Promise<string | null> {
    const { data, error } = await this.client.from('passkey_challenges')
      .select('challenge').eq('user_id', userId).maybeSingle();
    if (error) throw new Error('Could not load passkey challenge.');
    return typeof data?.challenge === 'string' ? data.challenge : null;
  }

  async setCurrentChallenge(userId: string, challenge: string): Promise<void> {
    if (!challenge) {
      const { error } = await this.client.from('passkey_challenges').delete().eq('user_id', userId);
      if (error) throw new Error('Could not clear passkey challenge.');
      return;
    }
    const { error } = await this.client.from('passkey_challenges').upsert({
      user_id: userId,
      challenge,
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    }, { onConflict: 'user_id' });
    if (error) throw new Error('Could not save passkey challenge.');
  }

  private mapCredential(row: Record<string, unknown>): PasskeyCredentialRecord {
    return {
      id: String(row.id),
      credentialId: String(row.credential_id),
      publicKey: buffer(row.public_key),
      counter: Number(row.counter),
      transports: Array.isArray(row.transports) ? row.transports.map(String) : [],
      ...(typeof row.device_type === 'string' ? { deviceType: row.device_type } : {}),
      backedUp: row.backed_up === true,
    };
  }
}

export class SupabaseSessionStore implements SessionStore {
  constructor(private readonly client: SupabaseClient) {}

  async save(session: PasskeySession): Promise<void> {
    const { error } = await this.client.from('passkey_sessions').insert({
      token_hash: tokenHash(session.token),
      user_id: session.userId,
      credential_id: session.credentialId,
      issued_at: new Date(session.issuedAt).toISOString(),
      expires_at: new Date(session.expiresAt).toISOString(),
    });
    if (error) throw new Error('Could not save passkey session.');
  }

  async get(token: string): Promise<PasskeySession | null> {
    const { data, error } = await this.client.from('passkey_sessions')
      .select('user_id, credential_id, issued_at, expires_at')
      .eq('token_hash', tokenHash(token)).maybeSingle();
    if (error) throw new Error('Could not load passkey session.');
    if (!data || Date.parse(data.expires_at) <= Date.now()) {
      if (data) await this.revoke(token);
      return null;
    }
    return {
      token,
      userId: data.user_id,
      credentialId: data.credential_id,
      issuedAt: Date.parse(data.issued_at),
      expiresAt: Date.parse(data.expires_at),
    };
  }

  async revoke(token: string): Promise<void> {
    const { error } = await this.client.from('passkey_sessions').delete().eq('token_hash', tokenHash(token));
    if (error) throw new Error('Could not revoke passkey session.');
  }
}
