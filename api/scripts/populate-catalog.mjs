// One-time catalog population script.
// Uses the service-role Supabase client to upsert the inactive Stripe MPP
// product, offering, and endpoint into the remote database.
// Run from api/: node --env-file=.env scripts/populate-catalog.mjs
//
// This script does not log any secret values.

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const profileId = process.env.STRIPE_PROFILE_ID ?? 'profile_test_replace_locally';

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Check .env.');
  process.exit(1);
}

const client = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function populate() {
  // 1. Upsert product
  const { data: product, error: productErr } = await client
    .from('products')
    .upsert(
      {
        slug: 'market-signal-sandbox',
        name: 'Market signal sandbox',
        description:
          'An inactive sample product used to verify payment-offering setup before publishing a real resource.',
        status: 'draft',
      },
      { onConflict: 'slug' },
    )
    .select('id, slug, status')
    .single();

  if (productErr) {
    console.error('Product upsert failed:', productErr.message);
    process.exit(1);
  }

  console.log('Product:', product.slug, product.status);

  // 2. Upsert offering
  const { data: offering, error: offeringErr } = await client
    .from('product_payment_offerings')
    .upsert(
      {
        product_id: product.id,
        rail: 'stripe_mpp',
        amount_minor: 50,
        currency: 'usd',
        scale: 2,
        network_id: profileId,
        active: false,
      },
      { onConflict: 'product_id,rail' },
    )
    .select('id, rail, amount_minor, currency, active')
    .single();

  if (offeringErr) {
    console.error('Offering upsert failed:', offeringErr.message);
    process.exit(1);
  }

  console.log(
    'Offering:',
    offering.rail,
    offering.amount_minor,
    offering.currency,
    'active=' + offering.active,
  );

  // 3. Upsert endpoint
  const { data: endpoint, error: endpointErr } = await client
    .from('product_endpoints')
    .upsert(
      {
        offering_id: offering.id,
        method: 'GET',
        path: '/v1/products/market-signal-sandbox/mpp',
        response_body: { data: 'activate the offering before serving this product' },
        enabled: false,
      },
      { onConflict: 'method,path' },
    )
    .select('id, method, path, enabled')
    .single();

  if (endpointErr) {
    console.error('Endpoint upsert failed:', endpointErr.message);
    process.exit(1);
  }

  console.log('Endpoint:', endpoint.method, endpoint.path, 'enabled=' + endpoint.enabled);
  console.log('Catalog populated successfully.');
}

populate().catch((err) => {
  console.error('Unexpected error:', err.message);
  process.exit(1);
});
