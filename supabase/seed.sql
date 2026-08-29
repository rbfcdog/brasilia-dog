insert into public.products (slug, name, description, status)
values (
  'market-signal-sandbox',
  'Market signal sandbox',
  'An inactive sample product used to verify payment-offering setup before publishing a real resource.',
  'draft'
)
on conflict (slug) do nothing;

insert into public.product_payment_offerings (
  product_id,
  rail,
  amount_minor,
  currency,
  scale,
  network_id,
  active
)
select id, 'stripe_mpp', 50, 'usd', 2, 'profile_test_replace_locally', false
from public.products
where slug = 'market-signal-sandbox'
on conflict (product_id, rail) do nothing;


insert into public.product_endpoints (
  offering_id,
  method,
  path,
  response_body,
  enabled
)
select id, 'GET', '/v1/products/market-signal-sandbox/mpp', '{"data":"activate the offering before serving this product"}'::jsonb, false
from public.product_payment_offerings
where rail = 'stripe_mpp'
  and product_id = (select id from public.products where slug = 'market-signal-sandbox')
on conflict (method, path) do nothing;

