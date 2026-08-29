import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import type { PasskeySession } from '../domain/types.js';

const SESSION_TTL_SECONDS = 300; // 5 minutes
const TOKEN_BYTES = 32;

export interface SessionStore {
  save(session: PasskeySession): Promise<void>;
  get(token: string): Promise<PasskeySession | null>;
  revoke(token: string): Promise<void>;
}

export class InMemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, PasskeySession>();

  async save(session: PasskeySession): Promise<void> {
    this.sessions.set(session.token, session);
  }

  async get(token: string): Promise<PasskeySession | null> {
    const session = this.sessions.get(token);
    if (!session) {
      return null;
    }
    if (session.expiresAt <= Date.now()) {
      this.sessions.delete(token);
      return null;
    }
    return session;
  }

  async revoke(token: string): Promise<void> {
    this.sessions.delete(token);
  }
}

interface SessionServiceOptions {
  secret: string;
  store: SessionStore;
  ttlSeconds?: number;
}

export class SessionService {
  private readonly secret: string;
  private readonly store: SessionStore;
  private readonly ttlSeconds: number;

  constructor({ secret, store, ttlSeconds = SESSION_TTL_SECONDS }: SessionServiceOptions) {
    if (!secret || secret.length < 32) {
      throw new Error('Session secret must be at least 32 bytes.');
    }
    this.secret = secret;
    this.store = store;
    this.ttlSeconds = ttlSeconds;
  }

  async createSession(userId: string, credentialId: string): Promise<PasskeySession> {
    const now = Date.now();
    const raw = randomBytes(TOKEN_BYTES);
    const token = raw.toString('base64url');
    const sig = this.sign(token);

    const session: PasskeySession = {
      token: `${token}.${sig}`,
      userId,
      credentialId,
      issuedAt: now,
      expiresAt: now + this.ttlSeconds * 1000,
    };

    await this.store.save(session);
    return session;
  }

  async verifySession(token: string): Promise<PasskeySession | null> {
    const parts = token.split('.');
    if (parts.length !== 2) {
      return null;
    }

    const raw = parts[0]!;
    const sig = parts[1]!;
    const expectedSig = this.sign(raw);

    if (!this.constantTimeEqual(sig, expectedSig)) {
      return null;
    }

    return this.store.get(token);
  }

  async revokeSession(token: string): Promise<void> {
    const parts = token.split('.');
    if (parts.length === 2) {
      await this.store.revoke(token);
    }
  }

  private sign(token: string): string {
    return createHmac('sha256', this.secret).update(token).digest('base64url');
  }

  private constantTimeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) {
      return false;
    }
    return timingSafeEqual(bufA, bufB);
  }
}
