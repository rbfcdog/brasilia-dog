import type { PasskeyCredentialRecord, PasskeyStore } from '../services/passkey-service.js';

export class InMemoryPasskeyStore implements PasskeyStore {
  private readonly credentials = new Map<string, Map<string, PasskeyCredentialRecord>>();
  private readonly challenges = new Map<string, string>();

  async saveCredential(userId: string, credential: PasskeyCredentialRecord): Promise<void> {
    let userCredentials = this.credentials.get(userId);
    if (!userCredentials) {
      userCredentials = new Map();
      this.credentials.set(userId, userCredentials);
    }
    userCredentials.set(credential.credentialId, credential);
  }

  async getCredential(userId: string, credentialId: string): Promise<PasskeyCredentialRecord | null> {
    return this.credentials.get(userId)?.get(credentialId) ?? null;
  }

  async listCredentials(userId: string): Promise<PasskeyCredentialRecord[]> {
    const userCredentials = this.credentials.get(userId);
    if (!userCredentials) {
      return [];
    }
    return [...userCredentials.values()];
  }

  async updateCounter(userId: string, credentialId: string, counter: number): Promise<void> {
    const credential = this.credentials.get(userId)?.get(credentialId);
    if (credential) {
      credential.counter = counter;
    }
  }

  async getCurrentChallenge(userId: string): Promise<string | null> {
    return this.challenges.get(userId) ?? null;
  }

  async setCurrentChallenge(userId: string, challenge: string): Promise<void> {
    if (challenge) {
      this.challenges.set(userId, challenge);
    } else {
      this.challenges.delete(userId);
    }
  }
}
