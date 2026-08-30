import { z } from 'zod';
import {
  agentProofSchema,
  flightOfferSchema,
  mandateViewSchema,
  resumeVerificationResultSchema,
  verificationResultSchema,
  type AgentProof,
  type FlightOffer,
  type MandateView,
  type ResumeVerificationResult,
  type VerificationResult,
} from './contracts.js';
import type { AgentProofRequest } from './crypto.js';
import { AgentError } from './errors.js';

export interface CatalogSearchInput {
  goal: string;
  mandate: MandateView;
}

export interface SignatureRequest extends AgentProofRequest {
  nonce: string;
  issuedAt: number;
  expiresAt: number;
}

export interface SignedPresentation {
  rawBody: string;
  encodedProof: string;
  idempotencyKey: string;
}

export interface MandateAdapter {
  getMandate(mandateId: string): Promise<MandateView>;
}

export interface FlightCatalogAdapter {
  searchFlights(input: CatalogSearchInput): Promise<FlightOffer[]>;
}

export interface AgentSignerAdapter {
  sign(request: SignatureRequest): Promise<AgentProof>;
}

export interface PurchaseAdapter {
  presentPurchase(input: SignedPresentation): Promise<VerificationResult>;
  resumePurchase(attemptId: string, input: SignedPresentation): Promise<ResumeVerificationResult>;
}

export interface ConversationMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface ConversationContextAdapter {
  getConversationMessages(conversationId: string): Promise<ConversationMessage[]>;
}

export const catalogProductSchema = z.strictObject({
  id: z.string().trim().min(1),
  slug: z.string().trim().min(1),
  name: z.string().trim().min(1),
  description: z.string(),
  // Search is a compatibility boundary: the agent needs stable product
  // identity, price, and executable endpoint, not backend-only lifecycle
  // fields. Older deployed search RPCs omit those fields.
  status: z.enum(['draft', 'published', 'archived']).optional().default('published'),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
  offering: z.strictObject({
    id: z.string().trim().min(1),
    rail: z.literal('stripe_mpp'),
    amountMinor: z.number().int().positive(),
    currency: z.literal('usd'),
    scale: z.literal(2),
    networkId: z.string().nullable().optional().default(null),
    active: z.boolean().optional().default(true),
  }),
  endpoint: z.strictObject({
    id: z.string().trim().min(1),
    method: z.enum(['GET', 'POST']),
    path: z.string().startsWith('/'),
    enabled: z.boolean().optional().default(true),
  }),
});

export type CatalogProduct = z.infer<typeof catalogProductSchema>;

export interface ProductSearchInput {
  query: string | null;
  category: string | null;
  maximumAmountMinor: number | null;
  slugs: string[];
  limit: number;
}

export interface ProductCatalogAdapter {
  listProducts(): Promise<CatalogProduct[]>;
  searchProducts(input: ProductSearchInput): Promise<CatalogProduct[]>;
}

export interface AgentAdapters {
  mandates: MandateAdapter;
  catalog: FlightCatalogAdapter;
  signer: AgentSignerAdapter;
  purchases: PurchaseAdapter;
  conversations?: ConversationContextAdapter;
  products?: ProductCatalogAdapter;
}

const successEnvelopeSchema = z.strictObject({
  ok: z.literal(true),
  data: z.unknown(),
});

const conversationMessagesSchema = z.strictObject({
  conversation: z.strictObject({
    id: z.string().trim().min(1),
    ownerId: z.string().uuid(),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  }),
  messages: z.array(z.strictObject({
    id: z.string().trim().min(1),
    conversationId: z.string().trim().min(1),
    role: z.enum(['user', 'assistant']),
    content: z.string(),
    createdAt: z.string().datetime({ offset: true }),
  })),
});

const productCatalogSchema = z.strictObject({
  products: z.array(catalogProductSchema),
});

export class HttpBackendAdapter implements
  AgentAdapters,
  MandateAdapter,
  FlightCatalogAdapter,
  AgentSignerAdapter,
  PurchaseAdapter,
  ConversationContextAdapter,
  ProductCatalogAdapter {
  readonly mandates = this;
  readonly catalog = this;
  readonly signer = this;
  readonly purchases = this;
  readonly conversations = this;
  readonly products = this;
  private readonly baseUrl: URL;
  private readonly token: string;
  private readonly timeoutMs: number;

  constructor({ baseUrl, token, timeoutMs = 10_000 }: {
    baseUrl: string;
    token: string;
    timeoutMs?: number;
  }) {
    this.baseUrl = new URL(baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
    this.token = token;
    this.timeoutMs = timeoutMs;
  }

  async getMandate(mandateId: string): Promise<MandateView> {
    const data = await this.request(
      `v1/mandates/${encodeURIComponent(mandateId)}/agent-view`,
      { method: 'GET' },
    );
    return this.parseResponse(mandateViewSchema, data, 'mandate view');
  }

  async searchFlights(input: CatalogSearchInput): Promise<FlightOffer[]> {
    const data = await this.request('v1/catalog/flights/search', {
      method: 'POST',
      body: JSON.stringify({
        goal: input.goal,
        mandate: input.mandate,
      }),
    });
    return this.parseResponse(z.array(flightOfferSchema), data, 'flight catalog');
  }

  async sign(request: SignatureRequest): Promise<AgentProof> {
    const data = await this.request('v1/agent-proofs/sign', {
      method: 'POST',
      body: JSON.stringify(request),
    });
    return this.parseResponse(agentProofSchema, data, 'agent proof');
  }

  async presentPurchase(input: SignedPresentation): Promise<VerificationResult> {
    const data = await this.request('v1/purchase-attempts', {
      method: 'POST',
      body: input.rawBody,
      headers: this.presentationHeaders(input),
    });
    return this.parseResponse(verificationResultSchema, data, 'purchase verification result');
  }

  async resumePurchase(attemptId: string, input: SignedPresentation): Promise<ResumeVerificationResult> {
    const data = await this.request(
      `v1/purchase-attempts/${encodeURIComponent(attemptId)}/resume`,
      {
        method: 'POST',
        body: input.rawBody,
        headers: this.presentationHeaders(input),
      },
    );
    return this.parseResponse(resumeVerificationResultSchema, data, 'purchase resume result');
  }

  async getConversationMessages(conversationId: string): Promise<ConversationMessage[]> {
    const body = await this.requestRaw(
      `v1/agent/conversations/${encodeURIComponent(conversationId)}/messages`,
      { method: 'GET' },
    );
    return this.parseResponse(conversationMessagesSchema, body, 'conversation transcript').messages;
  }

  async listProducts(): Promise<CatalogProduct[]> {
    const body = await this.requestRaw('v1/agent/products', { method: 'GET' });
    return this.parseResponse(productCatalogSchema, body, 'product catalog').products;
  }

  async searchProducts(input: ProductSearchInput): Promise<CatalogProduct[]> {
    const body = await this.requestRaw('v1/agent/products/search', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return this.parseResponse(productCatalogSchema, body, 'marketplace search').products;
  }

  private presentationHeaders(input: SignedPresentation): HeadersInit {
    return {
      'Idempotency-Key': input.idempotencyKey,
      'X-Agent-Proof': input.encodedProof,
    };
  }

  private async request(path: string, init: RequestInit): Promise<unknown> {
    const body = await this.requestRaw(path, init);
    const envelope = successEnvelopeSchema.safeParse(body);
    if (!envelope.success) {
      throw new AgentError('BACKEND_RESPONSE_INVALID', 'The backend response envelope is invalid.', 502);
    }
    return envelope.data.data;
  }

  private async requestRaw(path: string, init: RequestInit): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(new URL(path, this.baseUrl), {
        ...init,
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          ...init.headers,
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new AgentError('BACKEND_REQUEST_FAILED', 'The backend request failed.', 502, {
        cause: error,
      });
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      throw new AgentError('BACKEND_RESPONSE_INVALID', 'The backend returned non-JSON content.', 502, {
        cause: error,
      });
    }

    if (!response.ok) {
      if (path.startsWith('v1/agent/products')) {
        if (response.status === 404 || response.status === 402) {
          throw new AgentError(
            'PRODUCT_CATALOG_UNAVAILABLE',
            'The configured backend cannot serve the agent product catalog.',
            503,
          );
        }
        if (response.status === 401 || response.status === 403) {
          throw new AgentError(
            'PRODUCT_CATALOG_UNAVAILABLE',
            'The agent backend catalog credentials were rejected.',
            503,
          );
        }
        if (response.status >= 500) {
          throw new AgentError(
            'PRODUCT_CATALOG_UNAVAILABLE',
            'The backend product catalog is temporarily unavailable.',
            503,
          );
        }
      }
      throw new AgentError('BACKEND_REQUEST_FAILED', `The backend returned HTTP ${response.status}.`, 502);
    }

    return body;
  }

  private parseResponse<T>(schema: z.ZodType<T>, data: unknown, name: string): T {
    const result = schema.safeParse(data);
    if (!result.success) {
      throw new AgentError('BACKEND_RESPONSE_INVALID', `The backend ${name} is invalid.`, 502, {
        cause: result.error,
      });
    }
    return result.data;
  }
}
