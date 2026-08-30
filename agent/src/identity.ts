import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
  type KeyObject,
} from 'node:crypto';

import { canonicalJson } from './canonical-json.js';
import { canonicalAgentProofPayload } from './crypto.js';
import {
  agentProofSchema,
  type AgentProof,
  type AgentProofPayload,
} from './contracts.js';

// PKCS8 DER prefix for an Ed25519 private key over a raw 32-byte seed. It lets
// the identity derive a stable keypair from a server-side secret without
// storing key material anywhere.
const ED25519_PKCS8_SEED_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

export interface AgentIdentityView {
  algorithm: 'Ed25519';
  publicKeyJwk: JsonWebKey;
  fingerprint: string;
}

/**
 * The agent's Ed25519 identity. The private key is derived deterministically
 * from a deployment secret (the service token) so every process restart
 * presents the same public key and the backend `ensure_agent_identity`
 * upsert resolves to the same agent identity and signing key. The private key
 * never leaves the agent process; only the public JWK and its fingerprint are
 * exposed. The fingerprint must equal the backend's
 * `sha256(canonicalJson(publicKeyJwk))` (see /v1/agents/ensure).
 */
export class LocalAgentIdentity {
  private readonly privateKey: KeyObject;
  private readonly publicKeyJwk: JsonWebKey;
  private readonly fingerprint: string;

  constructor(seedSecret: string) {
    const seed = createHash('sha256').update(`agent-identity-v1:${seedSecret}`).digest();
    this.privateKey = createPrivateKey({
      key: Buffer.concat([ED25519_PKCS8_SEED_PREFIX, seed]),
      format: 'der',
      type: 'pkcs8',
    });
    const exported = createPublicKey(this.privateKey).export({ format: 'jwk' }) as {
      kty?: string;
      crv?: string;
      x?: string;
    };
    if (exported.kty !== 'OKP' || exported.crv !== 'Ed25519' || typeof exported.x !== 'string') {
      throw new Error('Could not derive the agent Ed25519 identity.');
    }
    this.publicKeyJwk = { kty: exported.kty, crv: exported.crv, x: exported.x };
    this.fingerprint = createHash('sha256')
      .update(canonicalJson(this.publicKeyJwk))
      .digest('hex');
  }

  identity(): AgentIdentityView {
    return {
      algorithm: 'Ed25519',
      publicKeyJwk: this.publicKeyJwk,
      fingerprint: this.fingerprint,
    };
  }

  signProof(payload: AgentProofPayload): AgentProof {
    const parsed = agentProofSchema.parse({
      ...payload,
      signature: sign(
        null,
        Buffer.from(canonicalAgentProofPayload(payload), 'utf8'),
        this.privateKey,
      ).toString('base64url'),
    });
    return parsed;
  }
}
