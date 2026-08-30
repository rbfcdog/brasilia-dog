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
set search_path = public, pg_temp
as $$
  select coalesce(
    jsonb_agg(result.entry order by result.rank desc, result.amount_minor asc, result.slug asc),
    '[]'::jsonb
  )
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
        'merchant', case
          when merchants.user_id is null then null
          else jsonb_build_object(
            'id', merchants.user_id,
            'businessName', merchants.business_name,
            'status', merchants.status
          )
        end,
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
    join public.product_payment_offerings offerings on offerings.product_id = products.id
    join public.product_endpoints endpoints on endpoints.offering_id = offerings.id
    left join public.merchant_profiles merchants on merchants.user_id = products.owner_id
    where products.status = 'published'
      and offerings.rail = 'stripe_mpp'
      and offerings.active
      and endpoints.enabled
      and (
        nullif(btrim(p_category), '') is null
        or lower(products.metadata->>'category') = lower(btrim(p_category))
      )
      and (p_maximum_amount_minor is null or offerings.amount_minor <= p_maximum_amount_minor)
      and (
        coalesce(array_length(p_slugs, 1), 0) = 0
        or products.slug = any(p_slugs)
      )
    order by rank desc, offerings.amount_minor asc, products.slug asc
    limit least(greatest(p_limit, 1), 25)
  ) result;
$$;

revoke all on function public.search_agent_mpp_products(text, text, bigint, text[], integer)
  from public, anon, authenticated;
grant execute on function public.search_agent_mpp_products(text, text, bigint, text[], integer)
  to service_role;
