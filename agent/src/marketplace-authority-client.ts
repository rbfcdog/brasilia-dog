import { Receipt } from 'mppx';
import { Mppx, stripe } from 'mppx/client';

import { PersistentAgentIdentity } from './agent-identity.js';
import { canonicalJson } from './canonical-json.js';
import { candidateResponseSchema, type MarketplaceMandate, type MarketplaceProduct } from './marketplace-contracts.js';
import { AgentError } from './errors.js';

async function errorDetail(response: Response): Promise<string> {
  const body = await response.json().catch(() => null) as {
    detail?: string;
    error?: string | { message?: string; code?: string };
  } | null;
  if (body?.detail) return body.detail;
  if (typeof body?.error === 'string') return body.error;
  return body?.error?.message ?? body?.error?.code ?? `HTTP ${response.status}`;
}

export class MarketplaceAuthorityClient {
  private readonly baseUrl: URL;
  private readonly payer: ReturnType<typeof Mppx.create>;
  private paymentCredentialCreated = false;

  constructor(private readonly options: {
    baseUrl: string;
    token: string;
    stripeSecretKey: string;
    identity: PersistentAgentIdentity;
  }) {
    this.baseUrl = new URL(options.baseUrl.endsWith('/') ? options.baseUrl : `${options.baseUrl}/`);
    this.payer = Mppx.create({
      methods: [stripe({
        paymentMethod: 'pm_card_visa',
        createToken: async ({ amount, currency, expiresAt, metadata, networkId, paymentMethod }) => {
          const body = new URLSearchParams({
            payment_method: paymentMethod ?? 'pm_card_visa',
            'usage_limits[currency]': currency,
            'usage_limits[max_amount]': amount,
            'usage_limits[expires_at]': String(expiresAt),
          });
          if (networkId) body.set('seller_details[network_id]', networkId);
          for (const [key, value] of Object.entries(metadata ?? {})) body.set(`metadata[${key}]`, value);
          const create = (params: URLSearchParams) => fetch('https://api.stripe.com/v1/test_helpers/shared_payment/granted_tokens', {
            method: 'POST',
            headers: {
              Authorization: `Basic ${Buffer.from(`${options.stripeSecretKey}:`).toString('base64')}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params,
          });
          let response = await create(body);
          if (!response.ok && (networkId || metadata)) {
            const detail = await errorDetail(response);
            if (detail.includes('unknown parameter') || detail.includes('Received unknown parameter')) {
              response = await create(new URLSearchParams({
                payment_method: paymentMethod ?? 'pm_card_visa',
                'usage_limits[currency]': currency,
                'usage_limits[max_amount]': amount,
                'usage_limits[expires_at]': String(expiresAt),
              }));
            } else throw new Error(`Stripe SPT creation failed: ${detail}`);
          }
          if (!response.ok) throw new Error(`Stripe SPT creation failed: ${await errorDetail(response)}`);
          const result = await response.json() as { id?: string };
          if (!result.id) throw new Error('Stripe did not return an SPT.');
          this.paymentCredentialCreated = true;
          return result.id;
        },
      })],
      polyfill: false,
      maxPaymentRetries: 1,
    });
  }

  async candidates(mandateId: string): Promise<{ mandate: MarketplaceMandate; candidates: MarketplaceProduct[] }> {
    const response = await fetch(new URL(`v1/agent/mandates/${encodeURIComponent(mandateId)}/candidates`, this.baseUrl), {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.options.token}`, 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new AgentError('AUTHORITY_UNAVAILABLE', await errorDetail(response), response.status === 404 ? 404 : 502);
    return candidateResponseSchema.parse(await response.json());
  }

  async purchase(input: {
    runId: string;
    mandate: MarketplaceMandate;
    product: MarketplaceProduct;
    agentIdentityId: string;
    agentSigningKeyId: string;
  }): Promise<{ proofId: string; receipt: Record<string, unknown>; paymentAttempt: Record<string, unknown> }> {
    const path = `/v1/agent/products/${encodeURIComponent(input.product.slug)}/purchase`;
    const intent = {
      schemaVersion: 'marketplace-purchase-intent-v1',
      runId: input.runId,
      mandate: { id: input.mandate.id, version: input.mandate.version },
      product: {
        id: input.product.id,
        slug: input.product.slug,
        merchantId: input.product.merchant.id,
        offeringId: input.product.offering.id,
        amountMinor: input.product.offering.amountMinor,
        currency: input.product.offering.currency,
      },
    };
    const canonicalIntent = canonicalJson(intent);
    const agentProof = this.options.identity.proof({
      agentId: input.agentIdentityId,
      agentKeyId: input.agentSigningKeyId,
      mandateId: input.mandate.id,
      mandateVersion: input.mandate.version,
      method: 'POST',
      path,
      canonicalIntent,
    });
    const idempotencyKey = crypto.randomUUID();
    this.paymentCredentialCreated = false;
    let response: Response;
    try {
      response = await this.payer.fetch(new URL(path.slice(1), this.baseUrl), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.options.token}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({ intent, agentProof }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      console.error(JSON.stringify({
        event: 'stripe_mpp_payment_failed',
        credentialCreated: this.paymentCredentialCreated,
        error: error instanceof Error ? error.message : 'Unknown Stripe MPP client failure',
      }));
      throw new AgentError(
        this.paymentCredentialCreated ? 'PAYMENT_OUTCOME_AMBIGUOUS' : 'PAYMENT_FAILED',
        this.paymentCredentialCreated
          ? 'The financial outcome is ambiguous and will not be retried automatically.'
          : 'The Stripe MPP payment failed before a credential was submitted.',
        502,
        { cause: error },
      );
    }
    if (!response.ok) {
      const detail = await errorDetail(response);
      throw new AgentError(response.status === 403 ? 'MANDATE_REJECTED' : 'PAYMENT_FAILED', detail, response.status);
    }
    const proofId = response.headers.get('x-agent-execution-proof-id');
    if (!proofId) throw new AgentError('PAYMENT_RESPONSE_INVALID', 'The settled response omitted the proof ID.', 502);
    const receipt = Receipt.fromResponse(response) as unknown as Record<string, unknown>;
    const attemptResponse = await fetch(new URL(`v1/agent/proofs/${encodeURIComponent(proofId)}/payment`, this.baseUrl), {
      headers: { Authorization: `Bearer ${this.options.token}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!attemptResponse.ok) throw new AgentError('PAYMENT_AUDIT_MISSING', 'The settled payment audit record is unavailable.', 502);
    const paymentBody = await attemptResponse.json() as { paymentAttempt?: Record<string, unknown> };
    if (!paymentBody.paymentAttempt || paymentBody.paymentAttempt.status !== 'settled') {
      throw new AgentError('PAYMENT_AUDIT_MISSING', 'The payment attempt is not settled.', 502);
    }
    return { proofId, receipt, paymentAttempt: paymentBody.paymentAttempt };
  }
}
