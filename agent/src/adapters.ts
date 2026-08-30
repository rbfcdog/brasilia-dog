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

export interface AgentAdapters {
  mandates: MandateAdapter;
  catalog: FlightCatalogAdapter;
  signer: AgentSignerAdapter;
  purchases: PurchaseAdapter;
}

const successEnvelopeSchema = z.strictObject({
  ok: z.literal(true),
  data: z.unknown(),
});

export class HttpBackendAdapter implements AgentAdapters, MandateAdapter, FlightCatalogAdapter, AgentSignerAdapter, PurchaseAdapter {
  readonly mandates = this;
  readonly catalog = this;
  readonly signer = this;
  readonly purchases = this;
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

  private presentationHeaders(input: SignedPresentation): HeadersInit {
    return {
      'Idempotency-Key': input.idempotencyKey,
      'X-Agent-Proof': input.encodedProof,
    };
  }

  private async request(path: string, init: RequestInit): Promise<unknown> {
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
      throw new AgentError('BACKEND_REQUEST_FAILED', `The backend returned HTTP ${response.status}.`, 502);
    }

    const envelope = successEnvelopeSchema.safeParse(body);
    if (!envelope.success) {
      throw new AgentError('BACKEND_RESPONSE_INVALID', 'The backend response envelope is invalid.', 502);
    }
    return envelope.data.data;
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
