import { createHash } from 'node:crypto';

import { verifyAgentProof } from './agent-proof.js';
import type { SessionService } from './session-service.js';
import type { AgentIdentityRepository } from '../repositories/agent-identity-repository.js';
import type { MandateRepository } from '../repositories/mandate-repository.js';
import type {
  AgentIdentity,
  AgentSigningKey,
  Mandate,
  MandateScope,
  PasskeySession,
} from '../domain/types.js';

export interface CrossCredentialResult {
  session: PasskeySession;
  agent: AgentIdentity;
  key: AgentSigningKey;
  mandate: Mandate;
  proofId: Pick<AgentIdentity, 'id'> & { nonce: string; expiresAt: number };
}

export interface CrossCredentialInput {
  sessionToken: string;
  agentProof: {
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
    signature: string;
  };
  method: string;
  path: string;
  body: string;
}

export class CrossCredentialAuth {
  constructor(
    private readonly sessionService: SessionService,
    private readonly agentIdentityRepo: AgentIdentityRepository,
    private readonly mandateRepo: MandateRepository,
  ) {}

  async authorize(input: CrossCredentialInput): Promise<CrossCredentialResult> {
    // Step 1: Verify the passkey session token
    const session = await this.sessionService.verifySession(input.sessionToken);
    if (!session) {
      throw new Error('Invalid or expired passkey session.');
    }

    // Step 2: Verify the agent Ed25519 proof
    const bodySha256 = createHash('sha256').update(input.body).digest('hex');

    // Look up the agent's active signing key
    const agent = await this.agentIdentityRepo.getIdentity(input.agentProof.agentId);
    if (!agent) {
      throw new Error('Agent identity not found.');
    }

    if (agent.status !== 'active') {
      throw new Error('Agent identity is not active.');
    }

    const key = await this.agentIdentityRepo.getActiveSigningKey(input.agentProof.agentId);
    if (!key) {
      throw new Error('No active signing key for agent.');
    }

    if (key.id !== input.agentProof.agentKeyId) {
      throw new Error('Agent proof key ID does not match the active signing key.');
    }

    const proofResult = verifyAgentProof({
      now: Math.floor(Date.now() / 1000),
      proof: input.agentProof,
      publicKeyJwk: key.publicKeyJwk,
      request: {
        bodySha256,
        mandateId: input.agentProof.mandateId,
        mandateVersion: input.agentProof.mandateVersion,
        method: input.method,
        path: input.path,
      },
    });

    // Step 3: Verify the mandate
    const mandate = await this.mandateRepo.getMandate(input.agentProof.mandateId);
    if (!mandate) {
      throw new Error('Mandate not found.');
    }

    if (mandate.status !== 'active') {
      throw new Error('Mandate is not active.');
    }

    if (mandate.version !== input.agentProof.mandateVersion) {
      throw new Error('Mandate version mismatch.');
    }

    if (new Date(mandate.expiresAt).getTime() < Date.now()) {
      throw new Error('Mandate has expired.');
    }

    if (mandate.agentIdentityId !== agent.id) {
      throw new Error('Mandate does not belong to this agent.');
    }

    // Step 4: Verify the session user owns this agent
    if (agent.ownerId !== session.userId) {
      throw new Error('Passkey session user does not own this agent.');
    }

    return {
      session,
      agent,
      key,
      mandate,
      proofId: {
        id: proofResult.agentId,
        nonce: proofResult.nonce,
        expiresAt: proofResult.expiresAt,
      },
    };
  }

  checkScope(mandate: Mandate, productSlug: string, amountMinor: number): void {
    const scope = mandate.scope as MandateScope;

    if (scope.allowedProductSlugs && scope.allowedProductSlugs.length > 0) {
      if (!scope.allowedProductSlugs.includes(productSlug)) {
        throw new Error('Product is not allowed by the mandate scope.');
      }
    }

    if (amountMinor > mandate.maxAmountMinor) {
      throw new Error('Purchase amount exceeds the mandate maximum.');
    }
  }
}
