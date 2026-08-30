import { createHash, createPublicKey, verify } from 'node:crypto';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { canonicalAgentProofPayload } from '../src/crypto.js';
import { LocalAgentIdentity } from '../src/identity.js';

// Mirrors the backend's /v1/agents/ensure fingerprint computation
// (sha256 over canonicalJson(publicKeyJwk) with sorted keys).
function backendFingerprint(jwk: JsonWebKey): string {
  const canonical = `{${Object.keys(jwk).sort().map((key) => `${JSON.stringify(key)}:${JSON.stringify((jwk as Record<string, unknown>)[key])}`).join(',')}}`;
  return createHash('sha256').update(canonical).digest('hex');
}

test('agent identity exposes an Ed25519 public JWK whose fingerprint matches the backend ensure computation', () => {
  const identity = new LocalAgentIdentity('server-side-seed-token-0001');

  const view = identity.identity();

  assert.equal(view.algorithm, 'Ed25519');
  assert.deepEqual(
    Object.keys(view.publicKeyJwk).sort(),
    ['crv', 'kty', 'x'],
  );
  assert.equal((view.publicKeyJwk as { kty?: string }).kty, 'OKP');
  assert.equal((view.publicKeyJwk as { crv?: string }).crv, 'Ed25519');
  assert.equal(view.fingerprint, backendFingerprint(view.publicKeyJwk));
});

test('the identity is deterministic per deployment secret and never exposes private material', () => {
  const first = new LocalAgentIdentity('server-side-seed-token-0002').identity();
  const second = new LocalAgentIdentity('server-side-seed-token-0002').identity();
  const other = new LocalAgentIdentity('a-different-secret-0003').identity();

  assert.deepEqual(first, second);
  assert.notEqual(first.fingerprint, other.fingerprint);
  assert.ok(!('d' in first.publicKeyJwk), 'the private key scalar must never be exported');
});

test('locally signed proofs verify with the exposed public key', () => {
  const identity = new LocalAgentIdentity('server-side-seed-token-0004');
  const payload = {
    agentId: 'agent-1',
    agentKeyId: 'key-1',
    bodySha256: 'a'.repeat(64),
    mandateId: 'mandate-1',
    mandateVersion: 1,
    method: 'POST',
    path: '/v1/products/example-slug/purchase',
    nonce: 'nonce-value',
    issuedAt: 1_000,
    expiresAt: 1_060,
  };

  const proof = identity.signProof(payload);
  const publicKey = createPublicKey({ format: 'jwk', key: identity.identity().publicKeyJwk });

  assert.ok(
    verify(null, Buffer.from(canonicalAgentProofPayload(payload), 'utf8'), publicKey, Buffer.from(proof.signature, 'base64url')),
  );
});
