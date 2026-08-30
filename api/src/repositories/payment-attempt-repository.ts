import type { SupabaseClient } from '@supabase/supabase-js';

import type { PaymentAttemptInput } from '../domain/types.js';

export class PaymentAttemptRepository {
  constructor(private readonly client: SupabaseClient) {}

  async record(input: PaymentAttemptInput): Promise<unknown> {
    const { data, error } = await this.client.rpc('record_payment_attempt', {
      p_product_id: input.productId,
      p_offering_id: input.offeringId,
      p_endpoint_id: input.endpointId,
      p_rail: input.rail,
      p_provider_payment_id: input.providerPaymentId ?? null,
      p_idempotency_key: input.idempotencyKey,
      p_status: input.status,
      p_amount_minor: input.amountMinor,
      p_currency: input.currency,
      p_scale: input.scale,
      p_request_fingerprint: input.requestFingerprint ?? null,
      p_agent_execution_proof_id: input.agentExecutionProofId ?? null,
      p_receipt: input.receipt ?? null,
      p_failure_code: input.failureCode ?? null,
    });

    if (error) {
      throw new Error('Could not record payment attempt.');
    }

    return data;
  }
}
