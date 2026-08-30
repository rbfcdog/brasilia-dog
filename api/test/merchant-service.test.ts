import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';

import { MerchantCommandError, MerchantService } from '../src/services/merchant-service.js';
import { createApp } from '../src/http/app.js';
import type { MppHandler } from '../src/domain/types.js';

function merchantClient(options: { rpc?: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: null | { code?: string; message: string } }>; authenticated?: boolean } = {}) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client = {
    auth: {
      getUser: async () => options.authenticated === false
        ? { data: { user: null }, error: { message: 'invalid' } }
        : { data: { user: { id: '11111111-1111-4111-8111-111111111111' } }, error: null },
    },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { status: 'active' }, error: null }) }),
      }),
    }),
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return options.rpc ? options.rpc(name, args) : { data: '22222222-2222-4222-8222-222222222222', error: null };
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

test('merchant authentication rejects an invalid Supabase user token', async () => {
  const { client } = merchantClient({ authenticated: false });
  const service = new MerchantService(client, 'profile_test_nomad');
  await assert.rejects(() => service.authenticate('invalid'), (error: unknown) => error instanceof MerchantCommandError && error.status === 401);
});

test('merchant command routes reject requests without a Supabase bearer token', async () => {
  const paidHandler: MppHandler = async () => new Response('paid');
  const app = createApp({ paidHandler, merchantService: {} as MerchantService });
  const response = await app(new Request('https://api.example/v1/merchant/products', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}),
  }));
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'merchant_authentication_required', detail: 'Merchant authentication is required.' });
});

test('product creation sends the verified owner and server payment profile to the atomic RPC', async () => {
  const { client, calls } = merchantClient();
  const service = new MerchantService(client, 'profile_test_nomad');
  const result = await service.createProduct('11111111-1111-4111-8111-111111111111', {
    name: 'Ultrawide monitor',
    slug: 'ultrawide-monitor',
    description: 'A precise thirty-four inch display.',
    amountMinor: 29900,
    currency: 'usd',
    metadata: { screen_size_inches: 34, panel: 'IPS', usb_c: true },
  });
  assert.equal(result.status, 'draft');
  assert.equal(calls[0]?.name, 'create_merchant_product');
  assert.equal(calls[0]?.args.p_owner_id, '11111111-1111-4111-8111-111111111111');
  assert.equal(calls[0]?.args.p_network_id, 'profile_test_nomad');
  assert.equal(calls[0]?.args.p_amount_minor, 29900);
});

test('product creation rejects non-positive or non-USD prices before persistence', async () => {
  const { client, calls } = merchantClient();
  const service = new MerchantService(client, 'profile_test_nomad');
  await assert.rejects(() => service.createProduct('owner', {
    name: 'Monitor', slug: 'monitor', description: 'A detailed monitor.', amountMinor: 0, currency: 'usd', metadata: { size: 34 },
  }), MerchantCommandError);
  await assert.rejects(() => service.createProduct('owner', {
    name: 'Monitor', slug: 'monitor', description: 'A detailed monitor.', amountMinor: 100, currency: 'brl', metadata: { size: 34 },
  }), MerchantCommandError);
  assert.equal(calls.length, 0);
});

test('refund case creation maps duplicate open cases to a conflict and never calls Stripe', async () => {
  const { client } = merchantClient({ rpc: async () => ({ data: null, error: { code: '23505', message: 'duplicate' } }) });
  const service = new MerchantService(client, 'profile_test_nomad');
  await assert.rejects(
    () => service.createRefundCase('11111111-1111-4111-8111-111111111111', {
      paymentAttemptId: '22222222-2222-4222-8222-222222222222', amountMinor: 5000, reason: 'requested_by_customer', note: 'Package returned.',
    }),
    (error: unknown) => error instanceof MerchantCommandError && error.status === 409,
  );
});
