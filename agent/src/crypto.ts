import {
  createHash,
  createPublicKey,
  verify,
} from 'node:crypto';
import {
  agentProofPayloadSchema,
  agentProofSchema,
  type AgentProof,
  type AgentProofPayload,
} from './contracts.js';
import { AgentError } from './errors.js';

const MAX_PROOF_LIFETIME_SECONDS = 300;
const MAX_CLOCK_SKEW_SECONDS = 30;

export interface AgentProofRequest {
  bodySha256: string;
  mandateId: string;
  mandateVersion: number;
  method: string;
  path: string;
}

export function sha256Utf8(value: string): string {
  return createHash('sha256').update(Buffer.from(value, 'utf8')).digest('hex');
}

export function canonicalAgentProofPayload(payload: AgentProofPayload): string {
  const parsed = agentProofPayloadSchema.parse({
    agentId: payload.agentId,
    agentKeyId: payload.agentKeyId,
    bodySha256: payload.bodySha256,
    expiresAt: payload.expiresAt,
    issuedAt: payload.issuedAt,
    mandateId: payload.mandateId,
    mandateVersion: payload.mandateVersion,
    method: payload.method,
    nonce: payload.nonce,
    path: payload.path,
  });

  return [
    'agent-proof-v1',
    parsed.agentId,
    parsed.agentKeyId,
    parsed.method,
    parsed.path,
    parsed.bodySha256,
    parsed.mandateId,
    String(parsed.mandateVersion),
    parsed.nonce,
    String(parsed.issuedAt),
    String(parsed.expiresAt),
  ].join('\n');
}

export function encodeAgentProof(proof: AgentProof): string {
  return Buffer.from(JSON.stringify(agentProofSchema.parse(proof)), 'utf8').toString('base64url');
}

export function decodeAgentProof(value: string): AgentProof {
  try {
    return agentProofSchema.parse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
  } catch (error) {
    throw new AgentError('AGENT_PROOF_INVALID', 'The encoded agent proof is invalid.', 400, {
      cause: error,
    });
  }
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
  const parsed = agentProofSchema.parse(proof);
  const requestMatches = parsed.bodySha256 === request.bodySha256
    && parsed.mandateId === request.mandateId
    && parsed.mandateVersion === request.mandateVersion
    && parsed.method === request.method
    && parsed.path === request.path;

  if (!requestMatches) {
    throw new AgentError('AGENT_PROOF_MISMATCH', 'The agent proof does not match the request.');
  }

  if (parsed.issuedAt > now + MAX_CLOCK_SKEW_SECONDS
    || parsed.expiresAt <= now
    || parsed.expiresAt - parsed.issuedAt > MAX_PROOF_LIFETIME_SECONDS) {
    throw new AgentError('AGENT_PROOF_EXPIRED', 'The agent proof is expired or outside its permitted lifetime.');
  }

  if (publicKeyJwk.kty !== 'OKP'
    || publicKeyJwk.crv !== 'Ed25519'
    || typeof publicKeyJwk.x !== 'string') {
    throw new AgentError('AGENT_KEY_INVALID', 'The agent public key must be an Ed25519 JWK.');
  }

  const payload = canonicalAgentProofPayload(parsed);
  const publicKey = createPublicKey({ format: 'jwk', key: publicKeyJwk });
  const signature = Buffer.from(parsed.signature, 'base64url');

  if (!verify(null, Buffer.from(payload, 'utf8'), publicKey, signature)) {
    throw new AgentError('AGENT_PROOF_SIGNATURE_INVALID', 'The agent proof signature is invalid.');
  }

  return {
    agentId: parsed.agentId,
    agentKeyId: parsed.agentKeyId,
    expiresAt: parsed.expiresAt,
    nonce: parsed.nonce,
  };
}
