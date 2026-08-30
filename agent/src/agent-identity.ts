import {
  createHash,
  createPrivateKey,
  generateKeyPairSync,
  randomBytes,
  sign,
  type KeyObject,
} from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { canonicalJson } from './canonical-json.js';
import { canonicalAgentProofPayload, sha256Utf8 } from './crypto.js';
import type { AgentProof, AgentProofPayload } from './contracts.js';

export interface PublicAgentIdentity {
  algorithm: 'Ed25519';
  publicKeyJwk: JsonWebKey;
  fingerprint: string;
}

function loadOrCreatePrivateJwk(encoded: string | undefined, keyPath: string): JsonWebKey {
  if (encoded) return JSON.parse(encoded) as JsonWebKey;
  const path = resolve(keyPath);
  if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8')) as JsonWebKey;
  const { privateKey } = generateKeyPairSync('ed25519');
  const jwk = privateKey.export({ format: 'jwk' });
  try {
    writeFileSync(path, `${JSON.stringify(jwk)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    return jwk;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      return JSON.parse(readFileSync(path, 'utf8')) as JsonWebKey;
    }
    throw error;
  }
}

export class PersistentAgentIdentity {
  private readonly privateKey: KeyObject;
  private readonly publicIdentity: PublicAgentIdentity;

  constructor(options: { privateJwk?: string; keyPath: string }) {
    const privateJwk = loadOrCreatePrivateJwk(options.privateJwk, options.keyPath);
    if (privateJwk.kty !== 'OKP' || privateJwk.crv !== 'Ed25519' || typeof privateJwk.d !== 'string') {
      throw new Error('AGENT_SIGNING_PRIVATE_JWK must be an Ed25519 private JWK.');
    }
    this.privateKey = createPrivateKey({ key: privateJwk, format: 'jwk' });
    const exported = this.privateKey.export({ format: 'jwk' });
    const publicKeyJwk: JsonWebKey = { kty: 'OKP', crv: 'Ed25519', x: exported.x };
    this.publicIdentity = {
      algorithm: 'Ed25519',
      publicKeyJwk,
      fingerprint: createHash('sha256').update(canonicalJson(publicKeyJwk)).digest('hex'),
    };
  }

  public(): PublicAgentIdentity {
    return structuredClone(this.publicIdentity);
  }

  proof(input: {
    agentId: string;
    agentKeyId: string;
    mandateId: string;
    mandateVersion: number;
    method: string;
    path: string;
    canonicalIntent: string;
  }): AgentProof {
    const issuedAt = Math.floor(Date.now() / 1000);
    const payload: AgentProofPayload = {
      agentId: input.agentId,
      agentKeyId: input.agentKeyId,
      bodySha256: sha256Utf8(input.canonicalIntent),
      expiresAt: issuedAt + 120,
      issuedAt,
      mandateId: input.mandateId,
      mandateVersion: input.mandateVersion,
      method: input.method,
      nonce: randomBytes(24).toString('base64url'),
      path: input.path,
    };
    return {
      ...payload,
      signature: sign(null, Buffer.from(canonicalAgentProofPayload(payload), 'utf8'), this.privateKey).toString('base64url'),
    };
  }
}
