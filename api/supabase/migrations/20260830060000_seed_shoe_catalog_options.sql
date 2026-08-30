-- Add three authoritative shoe listings for category browsing demonstrations.
-- They inherit the sandbox-only activation flow from the agent catalog seed.

insert into public.products (slug, name, description, status, metadata)
values
  ('city-runner-neutral-shoe', 'City Runner Neutral Shoe', 'Lightweight everyday running shoe with breathable mesh, neutral cushioning, and durable rubber outsole.', 'published', jsonb_build_object('category', 'shoes', 'seed', 'agent_catalog_20260830')),
  ('trail-grip-hiking-shoe', 'Trail Grip Hiking Shoe', 'Water-resistant hiking shoe with reinforced toe protection, stable grip, and cushioned support for day trails.', 'published', jsonb_build_object('category', 'shoes', 'seed', 'agent_catalog_20260830')),
  ('classic-leather-casual-shoe', 'Classic Leather Casual Shoe', 'Versatile leather casual shoe with padded footbed, stitched construction, and everyday city comfort.', 'published', jsonb_build_object('category', 'shoes', 'seed', 'agent_catalog_20260830'))
on conflict (slug) do update
set name = excluded.name,
    description = excluded.description,
    metadata = excluded.metadata;

insert into public.product_payment_offerings (product_id, rail, amount_minor, currency, scale, network_id, active)
select products.id, 'stripe_mpp', prices.amount_minor, 'usd', 2,
  'profile_test_replace_before_activation', false
from (values
  ('city-runner-neutral-shoe', 12900),
  ('trail-grip-hiking-shoe', 18900),
  ('classic-leather-casual-shoe', 9900)
) as prices(slug, amount_minor)
join public.products on products.slug = prices.slug
on conflict (product_id, rail) do update
set amount_minor = excluded.amount_minor,
    currency = excluded.currency,
    scale = excluded.scale;

insert into public.product_endpoints (offering_id, method, path, response_status, response_body, enabled)
select offerings.id, 'GET', '/v1/products/' || products.slug || '/mpp', 200,
  jsonb_build_object('product', products.slug, 'description', products.description, 'source', 'stripe_mpp_catalog'), false
from public.products
join public.product_payment_offerings offerings
  on offerings.product_id = products.id and offerings.rail = 'stripe_mpp'
where products.slug in ('city-runner-neutral-shoe', 'trail-grip-hiking-shoe', 'classic-leather-casual-shoe')
on conflict (method, path) do update
set response_status = excluded.response_status,
    response_body = excluded.response_body;
