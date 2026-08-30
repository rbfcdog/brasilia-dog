alter table public.products
add column if not exists search_document tsvector
generated always as (
  setweight(to_tsvector('simple', coalesce(name, '')), 'A') ||
  setweight(to_tsvector('simple', coalesce(metadata->>'category', '')), 'A') ||
  setweight(to_tsvector('simple', coalesce(description, '')), 'B') ||
  setweight(to_tsvector('simple', coalesce(slug, '')), 'C')
) stored;

create index if not exists products_search_document_gin_idx
on public.products using gin (search_document);

create index if not exists product_offerings_marketplace_filter_idx
on public.product_payment_offerings (amount_minor, product_id)
where active and rail = 'stripe_mpp';

create or replace function public.search_agent_mpp_products(
  p_query text default null,
  p_category text default null,
  p_maximum_amount_minor bigint default null,
  p_slugs text[] default '{}'::text[],
  p_limit integer default 10
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(result.entry order by result.rank desc, result.amount_minor asc, result.slug asc), '[]'::jsonb)
  from (
    select
      products.slug,
      offerings.amount_minor,
      case
        when nullif(btrim(p_query), '') is null then 0
        else ts_rank_cd(products.search_document, websearch_to_tsquery('simple', p_query))
      end as rank,
      jsonb_build_object(
        'id', products.id,
        'slug', products.slug,
        'name', products.name,
        'description', products.description,
        'status', products.status,
        'metadata', products.metadata,
        'offering', jsonb_build_object(
          'id', offerings.id,
          'rail', offerings.rail,
          'amountMinor', offerings.amount_minor,
          'currency', offerings.currency,
          'scale', offerings.scale,
          'networkId', offerings.network_id,
          'active', offerings.active
        ),
        'endpoint', jsonb_build_object(
          'id', endpoints.id,
          'method', endpoints.method,
          'path', endpoints.path,
          'enabled', endpoints.enabled
        )
      ) as entry
    from public.products products
    join public.product_payment_offerings offerings
      on offerings.product_id = products.id
    join public.product_endpoints endpoints
      on endpoints.offering_id = offerings.id
    where products.status = 'published'
      and offerings.rail = 'stripe_mpp'
      and (nullif(btrim(p_query), '') is null
        or products.search_document @@ websearch_to_tsquery('simple', p_query))
      and (nullif(btrim(p_category), '') is null
        or lower(products.metadata->>'category') = lower(btrim(p_category)))
      and (p_maximum_amount_minor is null
        or offerings.amount_minor <= p_maximum_amount_minor)
      and (coalesce(array_length(p_slugs, 1), 0) = 0
        or products.slug = any(p_slugs))
    order by rank desc, offerings.amount_minor asc, products.slug asc
    limit least(greatest(p_limit, 1), 25)
  ) result;
$$;

revoke all on function public.search_agent_mpp_products(text, text, bigint, text[], integer) from public;
grant execute on function public.search_agent_mpp_products(text, text, bigint, text[], integer) to service_role;
