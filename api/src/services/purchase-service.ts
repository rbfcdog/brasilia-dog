import { createHash } from 'node:crypto';

import type { CrossCredentialAuth } from './cross-credential-auth.js';
import type { ProductRepository } from '../repositories/product-repository.js';
import type { ProductEndpoint } from '../domain/types.js';

export interface PurchaseRequest {
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
}

export interface AuthorizedPurchase {
  agentId: string;
  mandateId: string;
  executionProofId: string;
  endpoint: ProductEndpoint;
}

interface PurchaseServiceOptions {
  crossCredentialAuth: CrossCredentialAuth;
  productRepository: ProductRepository;
  recordProof: (params: {
    agentIdentityId: string;
    agentSigningKeyId: string;
    mandateId: string;
    mandateVersion: number;
    requestMethod: string;
    requestPath: string;
    requestBodySha256: string;
    nonce: string;
    issuedAt: number;
    expiresAt: number;
    signature: string;
  }) => Promise<string>;
}

export class PurchaseService {
  private readonly crossCredentialAuth: CrossCredentialAuth;
  private readonly productRepository: ProductRepository;
  private readonly recordProof: PurchaseServiceOptions['recordProof'];

  constructor({ crossCredentialAuth, productRepository, recordProof }: PurchaseServiceOptions) {
    this.crossCredentialAuth = crossCredentialAuth;
    this.productRepository = productRepository;
    this.recordProof = recordProof;
  }

  async authorizePurchase(
    slug: string,
    method: string,
    path: string,
    canonicalIntent: string,
    purchaseRequest: PurchaseRequest,
  ): Promise<AuthorizedPurchase> {
    const auth = await this.crossCredentialAuth.authorize({
      sessionToken: purchaseRequest.sessionToken,
      agentProof: purchaseRequest.agentProof,
      method,
      path,
      body: canonicalIntent,
    });

    const endpoint = await this.productRepository.findEnabledEndpoint('GET', `/v1/products/${slug}/mpp`);
    if (!endpoint) {
      throw new Error('Product endpoint not found or not enabled.');
    }

    if (endpoint.product.slug !== slug) {
      throw new Error('Endpoint does not match the requested product slug.');
    }

    this.crossCredentialAuth.checkScope(auth.mandate, slug, endpoint.offering.amountMinor);

    // The database RPC rejects a reused nonce. Do not continue when the proof
    // cannot be persisted, because that would make replay detection advisory.
    const executionProofId = await this.recordProof({
      agentIdentityId: auth.agent.id,
      agentSigningKeyId: auth.key.id,
      mandateId: auth.mandate.id,
      mandateVersion: auth.mandate.version,
      requestMethod: method,
      requestPath: path,
      requestBodySha256: createHash('sha256').update(canonicalIntent).digest('hex'),
      nonce: auth.proofId.nonce,
      issuedAt: purchaseRequest.agentProof.issuedAt,
      expiresAt: purchaseRequest.agentProof.expiresAt,
      signature: purchaseRequest.agentProof.signature,
    });

    return {
      agentId: auth.agent.id,
      mandateId: auth.mandate.id,
      executionProofId,
      endpoint,
    };
  }
}
