import {
  generateKeyPairSync,
  randomUUID,
  sign as signBytes,
  type KeyObject,
} from 'node:crypto';
import type {
  AgentAdapters,
  CatalogProduct,
  CatalogSearchInput,
  ProductSearchInput,
  SignatureRequest,
  SignedPresentation,
} from './adapters.js';
import { catalogProductSchema } from './adapters.js';
import {
  agentProofSchema,
  flightOfferSchema,
  mandateViewSchema,
  purchaseIntentSchema,
  resumeIntentSchema,
  type AgentProof,
  type FlightOffer,
  type MandateView,
  type PurchaseIntent,
  type ResumeVerificationResult,
  type VerificationResult,
} from './contracts.js';
import {
  canonicalAgentProofPayload,
  decodeAgentProof,
  sha256Utf8,
  verifyAgentProof,
} from './crypto.js';
import { AgentError } from './errors.js';

export const DEMO_MANDATE_ID = 'mandate-vuelaya-cordoba';
export const DEMO_AGENT_ID = 'agent-marta-travel';
export const DEMO_AGENT_KEY_ID = 'agent-key-demo-1';
export const DEMO_APPROVE_ONCE_RESOLUTION_ID = 'approval:approve-once';
export const DEMO_DENY_RESOLUTION_ID = 'approval:deny';

export function createDemoMandate(now = new Date()): MandateView {
  const endOfMonth = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth() + 1,
    0,
    23,
    59,
    59,
  ));
  return {
    id: DEMO_MANDATE_ID,
    version: 1,
    agentId: DEMO_AGENT_ID,
    status: 'active',
    scope: {
      category: 'flight',
      destination: 'Córdoba',
    },
    maxAmountMinor: 15_000,
    currency: 'usd',
    expiresAt: endOfMonth.toISOString(),
  };
}

export function createDemoOffers(): FlightOffer[] {
  return [
    {
      offerId: 'vuelaya-cordoba-130',
      merchantId: 'vuelaya',
      category: 'flight',
      destination: 'Córdoba',
      amountMinor: 13_000,
      currency: 'usd',
      available: true,
      untrustedContent: 'VuelaYa flight offer to Córdoba for USD 130.',
    },
    {
      offerId: 'vuelaya-cordoba-300',
      merchantId: 'vuelaya',
      category: 'flight',
      destination: 'Córdoba',
      amountMinor: 30_000,
      currency: 'usd',
      available: true,
      untrustedContent: 'VuelaYa flight offer to Córdoba for USD 300.',
    },
  ];
}

export function createDemoProducts(): CatalogProduct[] {
  const fixtures = [
    {
      slug: 'ultrawide-monitor-buying-guide',
      name: 'Ultrawide monitor buying guide',
      description: 'Current comparison data for ultrawide monitors, panels, ports, and ergonomics.',
      category: 'electronics',
      keywords: 'monitor monitors tela telas ultrawide',
      amountMinor: 250,
    },
    {
      slug: 'noise-cancelling-headphone-index',
      name: 'Noise-cancelling headphone index',
      description: 'Current headphone pricing, codec, battery, and comfort data.',
      category: 'electronics',
      keywords: 'headphone headphones fone fones ouvido audio',
      amountMinor: 225,
    },
    {
      slug: 'running-shoe-fit-index',
      name: 'Running shoe fit index',
      description: 'Current running shoe geometry, cushioning, durability, and fit data.',
      category: 'sports',
      keywords: 'shoe shoes running corrida tenis tênis',
      amountMinor: 160,
    },
    {
      slug: 'travel-luggage-durability-index',
      name: 'Travel luggage durability index',
      description: 'Current luggage material, wheel, warranty, capacity, and price data.',
      category: 'travel',
      keywords: 'luggage suitcase travel bagagem mala malas viagem',
      amountMinor: 170,
    },
    {
      slug: 'air-purifier-room-index',
      name: 'Air purifier room index',
      description: 'Current clean-air delivery, filter, noise, and room-size comparison.',
      category: 'home',
      keywords: 'air purifier purificador ar filtro casa',
      amountMinor: 195,
    },
    {
      slug: 'project-management-software-index',
      name: 'Project management software index',
      description: 'Current project management pricing, controls, integrations, and limits.',
      category: 'software',
      keywords: 'project management software projeto projetos gestao gestão',
      amountMinor: 300,
    },
  ];

  return fixtures.map((fixture, index) => catalogProductSchema.parse({
    id: `demo-product-${index + 1}`,
    slug: fixture.slug,
    name: fixture.name,
    description: fixture.description,
    status: 'published',
    metadata: { category: fixture.category, source: 'demo', keywords: fixture.keywords },
    offering: {
      id: `demo-offering-${index + 1}`,
      rail: 'stripe_mpp',
      amountMinor: fixture.amountMinor,
      currency: 'usd',
      scale: 2,
      networkId: 'profile_test_local_dev_only',
      active: true,
    },
    endpoint: {
      id: `demo-endpoint-${index + 1}`,
      method: 'GET',
      path: `/v1/products/${fixture.slug}/mpp`,
      enabled: true,
    },
  }));
}

interface AttemptRecord {
  attemptId: string;
  intent: PurchaseIntent;
  approvalRequestId?: string;
}

interface IdempotencyRecord<T> {
  bodyHash: string;
  result: T;
}

export class DemoBackend implements AgentAdapters {
  readonly mandates = this;
  readonly catalog = this;
  readonly signer = this;
  readonly purchases = this;
  readonly products = this;
  readonly publicKeyJwk: JsonWebKey;
  readonly presentations: Array<{ path: string; rawBody: string; proof: AgentProof }> = [];
  private readonly privateKey: KeyObject;
  private readonly now: () => Date;
  private mandate: MandateView;
  private offers: FlightOffer[];
  private productCatalog: CatalogProduct[];
  private readonly usedNonces = new Set<string>();
  private readonly attempts = new Map<string, AttemptRecord>();
  private readonly idempotency = new Map<string, IdempotencyRecord<VerificationResult | ResumeVerificationResult>>();

  constructor({
    now = () => new Date(),
    mandate,
    offers,
    products,
  }: {
    now?: () => Date;
    mandate?: MandateView;
    offers?: FlightOffer[];
    products?: CatalogProduct[];
  } = {}) {
    const keys = generateKeyPairSync('ed25519');
    this.privateKey = keys.privateKey;
    this.publicKeyJwk = keys.publicKey.export({ format: 'jwk' });
    this.now = now;
    this.mandate = mandateViewSchema.parse(mandate ?? createDemoMandate(now()));
    this.offers = (offers ?? createDemoOffers()).map((offer) => flightOfferSchema.parse(offer));
    this.productCatalog = (products ?? createDemoProducts()).map((product) => catalogProductSchema.parse(product));
  }

  setMandate(update: Partial<MandateView>): void {
    this.mandate = mandateViewSchema.parse({ ...this.mandate, ...update });
  }

  setOffers(offers: FlightOffer[]): void {
    this.offers = offers.map((offer) => flightOfferSchema.parse(offer));
  }

  async getMandate(mandateId: string): Promise<MandateView> {
    if (mandateId !== this.mandate.id) {
      throw new AgentError('MANDATE_NOT_FOUND', 'The mandate was not found.', 404);
    }
    return structuredClone(this.mandate);
  }

  async searchFlights(_input: CatalogSearchInput): Promise<FlightOffer[]> {
    return structuredClone(this.offers);
  }

  async listProducts(): Promise<CatalogProduct[]> {
    return structuredClone(this.productCatalog);
  }

  async searchProducts(input: ProductSearchInput): Promise<CatalogProduct[]> {
    const normalize = (value: string) => value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    const query = input.query?.trim() ? normalize(input.query) : null;
    const category = input.category?.trim().toLowerCase() ?? null;
    const slugs = new Set(input.slugs);
    const ignoredTerms = new Set(['a', 'as', 'com', 'da', 'das', 'de', 'do', 'dos', 'e', 'em', 'for', 'of', 'o', 'os', 'para', 'the']);
    const queryTerms = query?.split(/\s+/).filter((term) => term && !ignoredTerms.has(term)) ?? [];
    const products = this.productCatalog.filter((product) => {
      const productCategory = typeof product.metadata.category === 'string'
        ? product.metadata.category.toLowerCase()
        : '';
      const keywords = typeof product.metadata.keywords === 'string' ? product.metadata.keywords : '';
      const searchable = normalize([product.slug, product.name, product.description, productCategory, keywords]
        .join(' ')
      );
      const matchesQuery = queryTerms.length === 0 || queryTerms.every((term) =>
        searchable.includes(term)
        || (term.endsWith('s') && term.length > 3 && searchable.includes(term.slice(0, -1))));

      return product.status === 'published'
        && product.offering.active
        && product.endpoint.enabled
        && (slugs.size === 0 || slugs.has(product.slug))
        && (!category || productCategory === category)
        && (input.maximumAmountMinor === null || product.offering.amountMinor <= input.maximumAmountMinor)
        && matchesQuery;
    });

    return structuredClone(products.slice(0, input.limit));
  }

  async sign(request: SignatureRequest): Promise<AgentProof> {
    const payload = {
      agentId: this.mandate.agentId,
      agentKeyId: DEMO_AGENT_KEY_ID,
      ...request,
    };
    const signature = signBytes(
      null,
      Buffer.from(canonicalAgentProofPayload(payload), 'utf8'),
      this.privateKey,
    ).toString('base64url');

    return agentProofSchema.parse({ ...payload, signature });
  }

  async presentPurchase(input: SignedPresentation): Promise<VerificationResult> {
    const idempotencyScope = `purchase:${input.idempotencyKey}`;
    const replay = this.readIdempotency<VerificationResult>(idempotencyScope, input.rawBody);
    if (replay) {
      return structuredClone(replay);
    }

    const intent = this.parseIntent(input.rawBody);
    const attemptId = `attempt-${randomUUID()}`;
    const proofFailure = this.verifyPresentation({
      encodedProof: input.encodedProof,
      rawBody: input.rawBody,
      mandateId: intent.mandate.id,
      mandateVersion: intent.mandate.version,
      method: 'POST',
      path: '/v1/purchase-attempts',
    });

    let result: VerificationResult;
    if (proofFailure) {
      result = this.rejected(attemptId, proofFailure.code, proofFailure.message);
    } else {
      result = this.evaluatePurchase(attemptId, intent);
    }

    this.attempts.set(attemptId, {
      attemptId,
      intent,
      ...(result.outcome === 'escalation_required'
        ? { approvalRequestId: result.approvalRequest.approvalRequestId }
        : {}),
    });
    this.writeIdempotency(idempotencyScope, input.rawBody, result);
    return structuredClone(result);
  }

  async resumePurchase(attemptId: string, input: SignedPresentation): Promise<ResumeVerificationResult> {
    const idempotencyScope = `resume:${attemptId}:${input.idempotencyKey}`;
    const replay = this.readIdempotency<ResumeVerificationResult>(idempotencyScope, input.rawBody);
    if (replay) {
      return structuredClone(replay);
    }

    const attempt = this.attempts.get(attemptId);
    if (!attempt?.approvalRequestId) {
      const result = this.rejected(attemptId, 'APPROVAL_NOT_PENDING', 'This purchase is not waiting for approval.');
      this.writeIdempotency(idempotencyScope, input.rawBody, result);
      return result;
    }

    const resumeIntent = resumeIntentSchema.parse(JSON.parse(input.rawBody));
    const path = `/v1/purchase-attempts/${attemptId}/resume`;
    const proofFailure = this.verifyPresentation({
      encodedProof: input.encodedProof,
      rawBody: input.rawBody,
      mandateId: attempt.intent.mandate.id,
      mandateVersion: attempt.intent.mandate.version,
      method: 'POST',
      path,
    });

    let result: ResumeVerificationResult;
    if (proofFailure) {
      result = this.rejected(attemptId, proofFailure.code, proofFailure.message);
    } else {
      const mandateFailure = this.currentMandateFailure(attempt.intent);
      if (mandateFailure) {
        result = this.rejected(attemptId, mandateFailure.code, mandateFailure.message);
      } else if (resumeIntent.approvalResolutionId === DEMO_APPROVE_ONCE_RESOLUTION_ID) {
        result = this.allowed(attemptId, attempt.intent);
      } else if (resumeIntent.approvalResolutionId === DEMO_DENY_RESOLUTION_ID) {
        result = this.rejected(attemptId, 'HUMAN_DENIED', 'The human denied this purchase.');
      } else {
        result = this.rejected(attemptId, 'APPROVAL_RESOLUTION_INVALID', 'The backend could not validate the approval resolution.');
      }
    }

    this.writeIdempotency(idempotencyScope, input.rawBody, result);
    return structuredClone(result);
  }

  private parseIntent(rawBody: string): PurchaseIntent {
    try {
      return purchaseIntentSchema.parse(JSON.parse(rawBody));
    } catch (error) {
      throw new AgentError('PURCHASE_INTENT_INVALID', 'The purchase intent is invalid.', 400, {
        cause: error,
      });
    }
  }

  private verifyPresentation(input: {
    encodedProof: string;
    rawBody: string;
    mandateId: string;
    mandateVersion: number;
    method: string;
    path: string;
  }): { code: string; message: string } | undefined {
    try {
      const proof = decodeAgentProof(input.encodedProof);
      verifyAgentProof({
        now: Math.floor(this.now().getTime() / 1_000),
        proof,
        publicKeyJwk: this.publicKeyJwk,
        request: {
          bodySha256: sha256Utf8(input.rawBody),
          mandateId: input.mandateId,
          mandateVersion: input.mandateVersion,
          method: input.method,
          path: input.path,
        },
      });

      if (proof.agentId !== this.mandate.agentId || proof.agentKeyId !== DEMO_AGENT_KEY_ID) {
        return { code: 'AGENT_IDENTITY_INVALID', message: 'The proof identity is not authorized for this mandate.' };
      }
      if (this.usedNonces.has(proof.nonce)) {
        return { code: 'AGENT_PROOF_REPLAYED', message: 'The agent proof nonce has already been used.' };
      }

      this.usedNonces.add(proof.nonce);
      this.presentations.push({ path: input.path, rawBody: input.rawBody, proof });
      return undefined;
    } catch (error) {
      const code = error instanceof AgentError ? error.code : 'AGENT_PROOF_INVALID';
      return { code, message: 'The agent proof could not be verified.' };
    }
  }

  private evaluatePurchase(attemptId: string, intent: PurchaseIntent): VerificationResult {
    const mandateFailure = this.currentMandateFailure(intent);
    if (mandateFailure) {
      return this.rejected(attemptId, mandateFailure.code, mandateFailure.message);
    }

    const currentOffer = this.offers.find((offer) => offer.offerId === intent.offer.offerId);
    const offerMatches = currentOffer?.available === true
      && currentOffer.merchantId === intent.offer.merchantId
      && currentOffer.category === intent.offer.category
      && currentOffer.destination === intent.offer.destination
      && currentOffer.amountMinor === intent.offer.amountMinor
      && currentOffer.currency === intent.offer.currency;
    if (!offerMatches) {
      return this.rejected(attemptId, 'OFFER_INVALID', 'The offer is unavailable or its current price differs.');
    }

    const inScope = intent.offer.category === this.mandate.scope.category
      && intent.offer.destination === this.mandate.scope.destination
      && intent.offer.currency === this.mandate.currency;
    if (!inScope) {
      return this.rejected(attemptId, 'MANDATE_SCOPE_MISMATCH', 'The offer is outside the mandate scope.');
    }

    const requiresEscalation = intent.offer.amountMinor > this.mandate.maxAmountMinor
      || intent.agentClaim.semanticEscalationRequested;
    if (requiresEscalation) {
      return {
        outcome: 'escalation_required',
        attemptId,
        approvalRequest: {
          approvalRequestId: `approval-request-${randomUUID()}`,
          requestedAmountMinor: intent.offer.amountMinor,
          mandateLimitMinor: this.mandate.maxAmountMinor,
          currency: intent.offer.currency,
          reason: `The agent requests ${intent.offer.amountMinor} minor units; the mandate limit is ${this.mandate.maxAmountMinor}.`,
        },
      };
    }

    return this.allowed(attemptId, intent);
  }

  private currentMandateFailure(intent: PurchaseIntent): { code: string; message: string } | undefined {
    if (this.mandate.status === 'revoked') {
      return { code: 'MANDATE_REVOKED', message: 'The mandate has been revoked.' };
    }
    if (this.mandate.status === 'expired' || new Date(this.mandate.expiresAt).getTime() <= this.now().getTime()) {
      return { code: 'MANDATE_EXPIRED', message: 'The mandate has expired.' };
    }
    if (intent.mandate.id !== this.mandate.id || intent.mandate.version !== this.mandate.version) {
      return { code: 'MANDATE_VERSION_MISMATCH', message: 'The mandate version is no longer current.' };
    }
    if (intent.agentClaim.selectedOffer.offerId !== intent.offer.offerId) {
      return { code: 'AGENT_CLAIM_MISMATCH', message: 'The signed claim does not match the presented offer.' };
    }
    return undefined;
  }

  private allowed(attemptId: string, intent: PurchaseIntent): ResumeVerificationResult {
    return {
      outcome: 'allowed',
      attemptId,
      receipt: {
        reference: `demo-receipt-${attemptId}`,
        merchantId: intent.offer.merchantId,
        offerId: intent.offer.offerId,
        amountMinor: intent.offer.amountMinor,
        currency: intent.offer.currency,
      },
    };
  }

  private rejected(attemptId: string, reasonCode: string, message: string): ResumeVerificationResult {
    return { outcome: 'rejected', attemptId, reasonCode, message };
  }

  private readIdempotency<T extends VerificationResult | ResumeVerificationResult>(scope: string, rawBody: string): T | undefined {
    const existing = this.idempotency.get(scope);
    if (!existing) {
      return undefined;
    }
    if (existing.bodyHash !== sha256Utf8(rawBody)) {
      throw new AgentError('IDEMPOTENCY_CONFLICT', 'The idempotency key was reused with a different body.', 409);
    }
    return existing.result as T;
  }

  private writeIdempotency<T extends VerificationResult | ResumeVerificationResult>(scope: string, rawBody: string, result: T): void {
    this.idempotency.set(scope, { bodyHash: sha256Utf8(rawBody), result: structuredClone(result) });
  }
}
