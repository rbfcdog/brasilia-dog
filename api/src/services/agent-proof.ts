import { createPublicKey, verify } from 'node:crypto';

const MAX_PROOF_LIFETIME_SECONDS = 300;
const MAX_CLOCK_SKEW_SECONDS = 30;
const SHA256_HEX = /^[a-f0-9]{64}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

export interface AgentProofPayload {
  agentId: string;
  agentKeyId: string;
  bodySha256: string;
  expiresAt: number;
  issuedAt: number;
  mandateId: string;
  mandateVersion: number;
  method: string;
  nonce: string;
  path: string;
}

export interface AgentProof extends AgentProofPayload {
  signature: string;
}

export interface AgentProofRequest {
  bodySha256: string;
  mandateId: string;
  mandateVersion: number;
  method: string;
  path: string;
}

function requireSingleLine(value: string, name: string): void {
  if (!value || /[\r\n]/.test(value)) {
    throw new Error(`Agent proof ${name} is invalid.`);
  }
}

function requireSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Agent proof ${name} is invalid.`);
  }
}

function validatePayload(payload: AgentProofPayload): void {
  requireSingleLine(payload.agentId, 'agent ID');
  requireSingleLine(payload.agentKeyId, 'key ID');
  requireSingleLine(payload.mandateId, 'mandate ID');
  requireSingleLine(payload.method, 'method');
  requireSingleLine(payload.path, 'path');
  requireSafeInteger(payload.mandateVersion, 'mandate version');
  requireSafeInteger(payload.issuedAt, 'issued-at timestamp');
  requireSafeInteger(payload.expiresAt, 'expiry timestamp');

  if (!SHA256_HEX.test(payload.bodySha256)) {
    throw new Error('Agent proof body hash is invalid.');
  }

  if (!BASE64URL.test(payload.nonce)) {
    throw new Error('Agent proof nonce is invalid.');
  }
}

export function canonicalAgentProofPayload(payload: AgentProofPayload): string {
  validatePayload(payload);

  return [
    'agent-proof-v1',
    payload.agentId,
    payload.agentKeyId,
    payload.method,
    payload.path,
    payload.bodySha256,
    payload.mandateId,
    String(payload.mandateVersion),
    payload.nonce,
    String(payload.issuedAt),
    String(payload.expiresAt),
  ].join('\n');
}

function matchesRequest(proof: AgentProof, request: AgentProofRequest): boolean {
  return proof.bodySha256 === request.bodySha256
    && proof.mandateId === request.mandateId
    && proof.mandateVersion === request.mandateVersion
    && proof.method === request.method
    && proof.path === request.path;
}

export function verifyAgentProof({
  now,
  proof,
  publicKeyJwk,
  request,
}: {
  now: number;
  proof: AgentProof;
  publicKeyJwk: JsonWebKey;
  request: AgentProofRequest;
}): Pick<AgentProof, 'agentId' | 'agentKeyId' | 'expiresAt' | 'nonce'> {
  requireSafeInteger(now, 'verification timestamp');
  const payload = canonicalAgentProofPayload(proof);

  if (!matchesRequest(proof, request)) {
    throw new Error('Agent proof does not match the request.');
  }

  if (proof.issuedAt > now + MAX_CLOCK_SKEW_SECONDS
    || proof.expiresAt <= now
    || proof.expiresAt - proof.issuedAt > MAX_PROOF_LIFETIME_SECONDS) {
    throw new Error('Agent proof is expired or outside its permitted lifetime.');
  }

  if (publicKeyJwk.kty !== 'OKP' || publicKeyJwk.crv !== 'Ed25519' || typeof publicKeyJwk.x !== 'string') {
    throw new Error('Agent public key must be an Ed25519 JWK.');
  }

  if (!BASE64URL.test(proof.signature)) {
    throw new Error('Agent proof signature is invalid.');
  }

  const publicKey = createPublicKey({ format: 'jwk', key: publicKeyJwk });
  const signature = Buffer.from(proof.signature, 'base64url');

  if (!verify(null, Buffer.from(payload), publicKey, signature)) {
    throw new Error('Agent proof signature is invalid.');
  }

  return {
    agentId: proof.agentId,
    agentKeyId: proof.agentKeyId,
    expiresAt: proof.expiresAt,
    nonce: proof.nonce,
  };
}
