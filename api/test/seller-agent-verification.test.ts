import assert from 'node:assert/strict';
import test from 'node:test';

import { SellerAgentVerificationService } from '../src/services/seller-agent-verification.js';

const secret = 'seller-verification-secret-that-is-at-least-32-bytes';

const issuedInput = {
  userId: 'user-1',
  passkeyCredentialId: 'credential-1',
  agentIdentityId: 'agent-1',
  mandateId: 'mandate-1',
  merchantId: 'merchant-1',
  expiresAt: '2026-08-30T00:00:00.000Z',
};

test('issues seller-scoped evidence that validates against its credential commitment', () => {
  const service = new SellerAgentVerificationService(secret);
  const issued = service.issue(issuedInput);

  assert.match(issued.credentialCommitment, /^[a-f0-9]{64}$/);
  assert.match(issued.agentVerificationHash, /^[a-f0-9]{64}$/);
  assert.equal(service.verify({
    userId: issuedInput.userId,
    credentialCommitment: issued.credentialCommitment,
    agentIdentityId: issuedInput.agentIdentityId,
    mandateId: issuedInput.mandateId,
    merchantId: issuedInput.merchantId,
    expiresAt: issuedInput.expiresAt,
  }, issued.agentVerificationHash), true);
});

test('rejects seller evidence replayed for another merchant', () => {
  const service = new SellerAgentVerificationService(secret);
  const issued = service.issue(issuedInput);

  assert.equal(service.verify({
    userId: issuedInput.userId,
    credentialCommitment: issued.credentialCommitment,
    agentIdentityId: issuedInput.agentIdentityId,
    mandateId: issuedInput.mandateId,
    merchantId: 'merchant-2',
    expiresAt: issuedInput.expiresAt,
  }, issued.agentVerificationHash), false);
});

test('rejects an insufficient app-owner secret', () => {
  assert.throws(
    () => new SellerAgentVerificationService('too-short'),
    /at least 32 characters/,
  );
});
