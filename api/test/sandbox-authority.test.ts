import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryAgentIdentityRepository } from '../src/repositories/agent-identity-repository.js';
import { InMemoryMandateRepository } from '../src/repositories/mandate-repository.js';

test('sandbox authority idempotently binds the deployment agent key to one owner', async () => {
  const repository = new InMemoryAgentIdentityRepository();
  const input = {
    ownerId: '00000000-0000-4000-8000-000000000001',
    displayName: 'Vero Sandbox Agent',
    publicKeyJwk: { kty: 'OKP', crv: 'Ed25519', x: 'public-key-material' },
    fingerprint: 'a'.repeat(64),
  };

  const first = await repository.ensureIdentity(input);
  const repeated = await repository.ensureIdentity(input);

  assert.equal(repeated.identity.id, first.identity.id);
  assert.equal(repeated.signingKey.id, first.signingKey.id);
  assert.equal((await repository.getActiveSigningKey(first.identity.id))?.publicKeyFingerprint, input.fingerprint);
});

test('sandbox mandate creation is idempotent without database grants', async () => {
  const repository = new InMemoryMandateRepository();
  const input = {
    ownerId: '00000000-0000-4000-8000-000000000001',
    agentIdentityId: '9748cc53-e6bd-440d-b26f-85be9b816c50',
    scope: {
      query: 'monitor ultrawide',
      category: 'electronics',
      constraints: [],
      searchWindowSeconds: 60 as const,
    },
    maxAmountMinor: 30_000,
    currency: 'usd',
    expiresAt: '2026-09-02T00:00:00.000Z',
    idempotencyKey: '514dc8ef-f6b4-455b-9ad4-12bc2a600444',
    bodySha256: 'body-hash',
  };

  const first = await repository.create(input);
  const repeated = await repository.create(input);

  assert.match(first.id, /^sandbox-mandate-/);
  assert.equal(repeated.id, first.id);
  assert.equal((await repository.getMandate(first.id))?.maxAmountMinor, 30_000);
});
