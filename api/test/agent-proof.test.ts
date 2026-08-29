import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';

import {
  canonicalAgentProofPayload,
  verifyAgentProof,
  type AgentProof,
} from '../src/services/agent-proof.js';

const now = 1_788_000_000;
const request = {
  bodySha256: 'a'.repeat(64),
  mandateId: '2e41322c-93be-401f-9c15-9051d0d45690',
  mandateVersion: 3,
  method: 'POST',
  path: '/v1/purchases',
};

function createProof(overrides: Partial<AgentProof> = {}) {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const unsigned = {
    agentId: 'ef2f28c8-6f34-4f89-aebf-049075f227f1',
    agentKeyId: '0f671dde-c0d7-4e4f-b6cf-3a05f2623a12',
    bodySha256: request.bodySha256,
    expiresAt: now + 60,
    issuedAt: now,
    mandateId: request.mandateId,
    mandateVersion: request.mandateVersion,
    method: request.method,
    nonce: 'ECUrF6JE-xQjWa_BtZ3mCw',
    path: request.path,
    ...overrides,
  };
  const payload = canonicalAgentProofPayload(unsigned);

  return {
    proof: {
      ...unsigned,
      signature: sign(null, Buffer.from(payload), privateKey).toString('base64url'),
    },
    publicKeyJwk: publicKey.export({ format: 'jwk' }),
  };
}

test('verifies an agent-owned Ed25519 proof that is bound to one purchase request', () => {
  const { proof, publicKeyJwk } = createProof();

  const verification = verifyAgentProof({
    now,
    proof,
    publicKeyJwk,
    request,
  });

  assert.deepEqual(verification, {
    agentId: proof.agentId,
    agentKeyId: proof.agentKeyId,
    expiresAt: proof.expiresAt,
    nonce: proof.nonce,
  });
});

test('rejects a proof when a user replays it against a different request', () => {
  const { proof, publicKeyJwk } = createProof();

  assert.throws(
    () => verifyAgentProof({
      now,
      proof,
      publicKeyJwk,
      request: { ...request, path: '/v1/purchases/other' },
    }),
    /does not match the request/,
  );
});

test('rejects an expired or tampered agent proof', () => {
  const expired = createProof({ expiresAt: now - 1 });
  const tampered = createProof();
  tampered.proof.signature = `${tampered.proof.signature}A`;

  assert.throws(
    () => verifyAgentProof({ now, proof: expired.proof, publicKeyJwk: expired.publicKeyJwk, request }),
    /expired/,
  );
  assert.throws(
    () => verifyAgentProof({ now, proof: tampered.proof, publicKeyJwk: tampered.publicKeyJwk, request }),
    /signature is invalid/,
  );
});
