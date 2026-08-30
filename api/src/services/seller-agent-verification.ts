import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

interface AgentVerificationInput {
  userId: string;
  passkeyCredentialId: string;
  agentIdentityId: string;
  mandateId: string;
  merchantId: string;
  expiresAt: string;
}

interface SellerVerificationInput {
  userId: string;
  credentialCommitment: string;
  agentIdentityId: string;
  mandateId: string;
  merchantId: string;
  expiresAt: string;
}

export interface SellerAgentVerification {
  credentialCommitment: string;
  agentVerificationHash: string;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function sameHash(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');

  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

/**
 * Creates seller-scoped pseudonymous evidence. A passkey credential proves a
 * WebAuthn authentication occurred, but neither biometric material nor a
 * credential identifier leaves this service.
 */
export class SellerAgentVerificationService {
  constructor(private readonly appOwnerSecret: string) {
    if (appOwnerSecret.length < 32) {
      throw new Error('Agent verification secret must be at least 32 characters.');
    }
  }

  private agentVerificationHash(input: SellerVerificationInput): string {
    const appOwnerCommitment = createHmac('sha256', this.appOwnerSecret)
      .update(`brasilia-dog/app-owner/v1\u0000${input.userId}`)
      .digest('hex');

    return sha256([
      'brasilia-dog/seller-agent/v1',
      input.credentialCommitment,
      appOwnerCommitment,
      input.agentIdentityId,
      input.mandateId,
      input.merchantId,
      input.expiresAt,
    ].join('\u0000'));
  }

  issue(input: AgentVerificationInput): SellerAgentVerification {
    const credentialCommitment = sha256(
      `brasilia-dog/passkey-credential/v1\u0000${input.passkeyCredentialId}`,
    );

    return {
      credentialCommitment,
      agentVerificationHash: this.agentVerificationHash({
        ...input,
        credentialCommitment,
      }),
    };
  }

  verify(input: SellerVerificationInput, expectedHash: string): boolean {
    if (!/^[a-f0-9]{64}$/.test(expectedHash)) return false;

    return sameHash(this.agentVerificationHash(input), expectedHash);
  }
}
