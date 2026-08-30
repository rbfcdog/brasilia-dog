import assert from 'node:assert/strict';
import test from 'node:test';

import { PaymentAttemptRepository } from '../src/repositories/payment-attempt-repository.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PaymentAttemptInput } from '../src/domain/types.js';

const paymentInput: PaymentAttemptInput = {
  productId: 'product-1',
  offeringId: 'offering-1',
  endpointId: 'endpoint-1',
  rail: 'stripe_mpp',
  providerPaymentId: 'provider-payment-1',
  idempotencyKey: 'cb535c19-0629-442d-8eb3-c61b787c791b',
  status: 'settled',
  amountMinor: 50,
  currency: 'usd',
  scale: 2,
  requestFingerprint: 'f'.repeat(64),
  receipt: { payment_id: 'provider-payment-1' },
};

test('records an auditable payment attempt through the atomic database function', async () => {
  const calls: [string, unknown][] = [];
  const client = {
    async rpc(name: string, arguments_: unknown) {
      calls.push([name, arguments_]);
      return { data: { id: 'attempt-1', status: 'settled' }, error: null };
    },
  };
  const repository = new PaymentAttemptRepository(client as unknown as SupabaseClient);

  const attempt = await repository.record(paymentInput);

  assert.deepEqual(attempt, { id: 'attempt-1', status: 'settled' });
  assert.deepEqual(calls, [[
    'record_payment_attempt',
    {
      p_product_id: 'product-1',
      p_offering_id: 'offering-1',
      p_endpoint_id: 'endpoint-1',
      p_rail: 'stripe_mpp',
      p_provider_payment_id: 'provider-payment-1',
      p_idempotency_key: 'cb535c19-0629-442d-8eb3-c61b787c791b',
      p_status: 'settled',
      p_amount_minor: 50,
      p_currency: 'usd',
      p_scale: 2,
      p_request_fingerprint: 'f'.repeat(64),
      p_agent_execution_proof_id: null,
      p_receipt: { payment_id: 'provider-payment-1' },
      p_failure_code: null,
    },
  ]]);
});

test('does not expose Supabase errors through the repository', async () => {
  const client = {
    async rpc() {
      return { data: null, error: { message: 'permission denied' } };
    },
  };
  const repository = new PaymentAttemptRepository(client as unknown as SupabaseClient);

  await assert.rejects(() => repository.record(paymentInput), /Could not record payment attempt/);
});
