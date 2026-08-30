import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import type { SupabaseClient } from '@supabase/supabase-js';

import { SellerQuoteRepository } from '../src/repositories/seller-quote-repository.js';

const quoteRow = {
  id: 'quote-1',
  merchant_id: 'merchant-1',
  owner_id: 'user-1',
  agent_identity_id: 'agent-1',
  mandate_id: 'mandate-1',
  credential_commitment: 'a'.repeat(64),
  agent_verification_hash: 'b'.repeat(64),
  price_limit_minor: 22000,
  currency: 'usd',
  requirements: ['34-inch ultrawide monitor'],
  expires_at: '2026-08-30T00:00:00.000Z',
  created_at: '2026-08-29T00:00:00.000Z',
};

test('records a seller quote request through the privileged database function', async () => {
  const calls: [string, unknown][] = [];
  const client = {
    async rpc(name: string, params: unknown) {
      calls.push([name, params]);
      return { data: quoteRow, error: null };
    },
  };
  const repository = new SellerQuoteRepository(client as unknown as SupabaseClient);

  const quote = await repository.create({
    merchantId: 'merchant-1',
    ownerId: 'user-1',
    agentIdentityId: 'agent-1',
    mandateId: 'mandate-1',
    credentialCommitment: 'a'.repeat(64),
    agentVerificationHash: 'b'.repeat(64),
    priceLimitMinor: 22000,
    currency: 'usd',
    requirements: ['34-inch ultrawide monitor'],
    expiresAt: '2026-08-30T00:00:00.000Z',
  });

  assert.equal(quote.id, 'quote-1');
  assert.deepEqual(calls, [[
    'record_seller_quote_request',
    {
      p_merchant_id: 'merchant-1',
      p_owner_id: 'user-1',
      p_agent_identity_id: 'agent-1',
      p_mandate_id: 'mandate-1',
      p_credential_commitment: 'a'.repeat(64),
      p_agent_verification_hash: 'b'.repeat(64),
      p_price_limit_minor: 22000,
      p_currency: 'usd',
      p_requirements: ['34-inch ultrawide monitor'],
      p_expires_at: '2026-08-30T00:00:00.000Z',
    },
  ]]);
});

test('uses only a hash of the merchant API key to load an unexpired quote', async () => {
  const queryValues: [string, string][] = [];
  const merchantKey = 'seller-key-that-must-not-be-stored-or-returned';
  const expectedKeyHash = createHash('sha256').update(merchantKey).digest('hex');
  const quoteQuery = {
    select() { return this; },
    eq(column: string, value: string) { queryValues.push([column, value]); return this; },
    gt() { return this; },
    async maybeSingle() { return { data: quoteRow, error: null }; },
  };
  const merchantQuery = {
    select() { return this; },
    eq(column: string, value: string) { queryValues.push([column, value]); return this; },
    async maybeSingle() { return { data: { id: 'merchant-1' }, error: null }; },
  };
  const client = {
    from(table: string) {
      return table === 'merchant_integrations' ? merchantQuery : quoteQuery;
    },
  };
  const repository = new SellerQuoteRepository(client as unknown as SupabaseClient);

  const quote = await repository.getForSeller(merchantKey, 'quote-1');

  assert.equal(quote?.id, 'quote-1');
  assert.deepEqual(queryValues.slice(0, 3), [
    ['api_key_hash', expectedKeyHash],
    ['status', 'active'],
    ['id', 'quote-1'],
  ]);
  assert.equal(queryValues.some(([, value]) => value === merchantKey), false);
});
