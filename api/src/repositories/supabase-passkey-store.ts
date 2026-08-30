import type { SupabaseClient } from '@supabase/supabase-js';

import type { PasskeyCredentialRecord, PasskeyStore } from '../services/passkey-service.js';

interface CredentialRow {
  id: string;
  credential_id: string;
  public_key: string;
  counter: number | string;
  transports: string[];
  device_type: string | null;
  backed_up: boolean;
}

function decodeBytea(value: string): Buffer {
  if (value.startsWith('\\x')) return Buffer.from(value.slice(2), 'hex');
  return Buffer.from(value, 'base64');
}

function mapCredential(row: CredentialRow): PasskeyCredentialRecord {
  return {
    id: row.id,
    credentialId: row.credential_id,
    publicKey: decodeBytea(row.public_key),
    counter: Number(row.counter),
    transports: row.transports,
    ...(row.device_type ? { deviceType: row.device_type } : {}),
    backedUp: row.backed_up,
  };
}

/** Durable credentials with intentionally short-lived, process-local challenges. */
export class SupabasePasskeyStore implements PasskeyStore {
  private readonly challenges = new Map<string, string>();

  constructor(private readonly client: SupabaseClient) {}

  async saveCredential(userId: string, credential: PasskeyCredentialRecord): Promise<void> {
    const { error } = await this.client.from('passkey_credentials').upsert({
      user_id: userId,
      credential_id: credential.credentialId,
      public_key: `\\x${credential.publicKey.toString('hex')}`,
      counter: credential.counter,
      transports: credential.transports,
      device_type: credential.deviceType ?? null,
      backed_up: credential.backedUp,
    }, { onConflict: 'credential_id' });
    if (error) throw new Error('Could not persist the passkey credential.');
  }

  async getCredential(userId: string, credentialId: string): Promise<PasskeyCredentialRecord | null> {
    const { data, error } = await this.client
      .from('passkey_credentials')
      .select('id, credential_id, public_key, counter, transports, device_type, backed_up')
      .eq('user_id', userId)
      .eq('credential_id', credentialId)
      .maybeSingle();
    if (error) throw new Error('Could not load the passkey credential.');
    return data ? mapCredential(data as CredentialRow) : null;
  }

  async listCredentials(userId: string): Promise<PasskeyCredentialRecord[]> {
    const { data, error } = await this.client
      .from('passkey_credentials')
      .select('id, credential_id, public_key, counter, transports, device_type, backed_up')
      .eq('user_id', userId);
    if (error) throw new Error('Could not list passkey credentials.');
    return (data as CredentialRow[]).map(mapCredential);
  }

  async updateCounter(userId: string, credentialId: string, counter: number): Promise<void> {
    const { error } = await this.client
      .from('passkey_credentials')
      .update({ counter })
      .eq('user_id', userId)
      .eq('credential_id', credentialId);
    if (error) throw new Error('Could not update the passkey counter.');
  }

  async getCurrentChallenge(userId: string): Promise<string | null> {
    return this.challenges.get(userId) ?? null;
  }

  async setCurrentChallenge(userId: string, challenge: string): Promise<void> {
    if (challenge) this.challenges.set(userId, challenge);
    else this.challenges.delete(userId);
  }
}
