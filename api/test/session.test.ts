import assert from 'node:assert/strict';
import test from 'node:test';

import { SessionService, InMemorySessionStore } from '../src/services/session-service.js';

const secret = 'a'.repeat(64);

function createService() {
  const store = new InMemorySessionStore();
  const service = new SessionService({ secret, store });
  return { service, store };
}

test('createSession returns a signed token with userId and expiry', async () => {
  const { service } = createService();

  const session = await service.createSession('user-1', 'cred-1');

  assert.ok(session.token);
  assert.equal(session.userId, 'user-1');
  assert.equal(session.credentialId, 'cred-1');
  assert.ok(session.expiresAt > Date.now());
  assert.ok(session.token.includes('.'));
});

test('verifySession accepts a valid token', async () => {
  const { service } = createService();

  const session = await service.createSession('user-1', 'cred-1');
  const verified = await service.verifySession(session.token);

  assert.ok(verified);
  assert.equal(verified!.userId, 'user-1');
  assert.equal(verified!.credentialId, 'cred-1');
});

test('verifySession rejects a tampered token', async () => {
  const { service } = createService();

  const session = await service.createSession('user-1', 'cred-1');
  const parts = session.token.split('.');
  const tampered = `${parts[0]}.invalid-signature`;

  const verified = await service.verifySession(tampered);
  assert.equal(verified, null);
});

test('verifySession rejects a token with no signature', async () => {
  const { service } = createService();

  const verified = await service.verifySession('just-a-token-without-dot');
  assert.equal(verified, null);
});

test('revokeSession makes the token invalid', async () => {
  const { service } = createService();

  const session = await service.createSession('user-1', 'cred-1');
  await service.revokeSession(session.token);
  const verified = await service.verifySession(session.token);
  assert.equal(verified, null);
});

test('SessionService rejects a secret shorter than 32 bytes', () => {
  assert.throws(
    () => new SessionService({ secret: 'short', store: new InMemorySessionStore() }),
    /Session secret must be at least 32 bytes/,
  );
});

test('expired sessions are automatically rejected', async () => {
  const store = new InMemorySessionStore();
  const service = new SessionService({ secret, store, ttlSeconds: 0 });

  const session = await service.createSession('user-1', 'cred-1');
  // TTL of 0 means it expires immediately
  const verified = await service.verifySession(session.token);
  assert.equal(verified, null);
});
