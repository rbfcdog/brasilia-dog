create table public.merchant_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  business_name text not null check (char_length(business_name) between 2 and 120),
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.refund_cases (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  payment_attempt_id uuid not null references public.payment_attempts(id) on delete restrict,
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null check (currency = 'usd'),
  reason text not null check (reason in ('duplicate', 'fraudulent', 'requested_by_customer')),
  note text check (note is null or char_length(note) <= 500),
  status text not null default 'requested' check (status in ('requested', 'under_review', 'approved', 'rejected', 'completed', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index refund_cases_one_open_case_per_attempt_idx
  on public.refund_cases (payment_attempt_id)
  where status in ('requested', 'under_review', 'approved');
create index refund_cases_owner_created_idx on public.refund_cases (owner_id, created_at desc);

create trigger merchant_profiles_set_updated_at before update on public.merchant_profiles
for each row execute function public.set_updated_at();
create trigger refund_cases_set_updated_at before update on public.refund_cases
for each row execute function public.set_updated_at();

create or replace function public.handle_new_merchant_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.merchant_profiles (user_id, business_name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'business_name'), ''), split_part(new.email, '@', 1), 'Merchant')
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created_create_merchant_profile
after insert on auth.users
for each row execute function public.handle_new_merchant_profile();

insert into public.merchant_profiles (user_id, business_name)
select id, coalesce(nullif(trim(raw_user_meta_data ->> 'business_name'), ''), split_part(email, '@', 1), 'Merchant')
from auth.users
on conflict (user_id) do nothing;

alter table public.merchant_profiles enable row level security;
alter table public.refund_cases enable row level security;

create policy "Merchants read their own profile"
on public.merchant_profiles for select to authenticated
using (user_id = auth.uid());

create policy "Merchants read their own products"
on public.products for select to authenticated
using (owner_id = auth.uid());

create policy "Merchants read offerings for their products"
on public.product_payment_offerings for select to authenticated
using (exists (select 1 from public.products where products.id = product_payment_offerings.product_id and products.owner_id = auth.uid()));

create policy "Merchants read endpoints for their products"
on public.product_endpoints for select to authenticated
using (exists (
  select 1 from public.product_payment_offerings
  join public.products on products.id = product_payment_offerings.product_id
  where product_payment_offerings.id = product_endpoints.offering_id and products.owner_id = auth.uid()
));

create policy "Merchants read payment attempts for their products"
on public.payment_attempts for select to authenticated
using (exists (select 1 from public.products where products.id = payment_attempts.product_id and products.owner_id = auth.uid()));

create policy "Merchants read audit events for their products"
on public.audit_events for select to authenticated
using (
  exists (select 1 from public.products where products.id = audit_events.product_id and products.owner_id = auth.uid())
  or exists (
    select 1 from public.payment_attempts
    join public.products on products.id = payment_attempts.product_id
    where payment_attempts.id = audit_events.payment_attempt_id and products.owner_id = auth.uid()
  )
);

create policy "Merchants read their own refund cases"
on public.refund_cases for select to authenticated
using (owner_id = auth.uid());

grant select on public.merchant_profiles, public.products, public.product_payment_offerings,
  public.product_endpoints, public.payment_attempts, public.audit_events, public.refund_cases to authenticated;

create or replace view public.merchant_dashboard_projection
with (security_invoker = true)
as
with owned_attempts as (
  select pa.*
  from public.payment_attempts pa
  join public.products p on p.id = pa.product_id
  where p.owner_id = auth.uid() and pa.created_at >= now() - interval '30 days'
)
select
  coalesce(sum(amount_minor) filter (where status in ('settled', 'refunded')), 0)::bigint as gmv_minor,
  'usd'::text as currency,
  count(*) filter (where status in ('settled', 'refunded'))::integer as settled_orders,
  count(*) filter (where agent_execution_proof_id is not null and status in ('challenged', 'settled', 'refunded', 'failed'))::integer as agent_attempts,
  count(*) filter (where agent_execution_proof_id is not null and status in ('settled', 'refunded'))::integer as converted_orders,
  coalesce(round(
    100.0 * count(*) filter (where agent_execution_proof_id is not null and status in ('settled', 'refunded'))
    / nullif(count(*) filter (where agent_execution_proof_id is not null and status in ('challenged', 'settled', 'refunded', 'failed')), 0), 1
  ), 0)::numeric as agent_conversion_rate,
  count(*) filter (where status = 'refunded')::integer as refunded_orders,
  count(*) filter (where status = 'failed')::integer as failed_orders
from owned_attempts;

create or replace view public.merchant_daily_sales_projection
with (security_invoker = true)
as
select
  pa.created_at::date as sale_date,
  sum(pa.amount_minor)::bigint as gmv_minor,
  count(*)::integer as settled_orders,
  pa.currency
from public.payment_attempts pa
join public.products p on p.id = pa.product_id
where p.owner_id = auth.uid()
  and pa.status in ('settled', 'refunded')
  and pa.created_at >= now() - interval '30 days'
group by pa.created_at::date, pa.currency;

create or replace view public.merchant_orders_projection
with (security_invoker = true)
as
select
  pa.id as order_id,
  p.id as product_id,
  p.name as product_name,
  p.slug as product_slug,
  pa.status,
  pa.amount_minor,
  pa.currency,
  pa.scale,
  pa.provider_payment_id,
  pa.receipt,
  pa.failure_code,
  pa.agent_execution_proof_id,
  case
    when pa.status = 'failed' or pa.failure_code is not null or (pa.status in ('settled', 'refunded') and pa.receipt is null) then 'high'
    when pa.status = 'challenged' or pa.agent_execution_proof_id is null then 'medium'
    else 'low'
  end::text as risk_level,
  array_remove(array[
    case when pa.status = 'failed' then 'payment_failed' end,
    case when pa.failure_code is not null then 'failure_code_present' end,
    case when pa.status in ('settled', 'refunded') and pa.receipt is null then 'receipt_missing' end,
    case when pa.status = 'challenged' then 'payment_challenge_open' end,
    case when pa.agent_execution_proof_id is null then 'agent_proof_missing' end,
    case when pa.status in ('settled', 'refunded') and pa.receipt is not null and pa.agent_execution_proof_id is not null then 'agent_proof_and_receipt_verified' end
  ]::text[], null) as risk_reasons,
  pa.created_at,
  pa.settled_at
from public.payment_attempts pa
join public.products p on p.id = pa.product_id
where p.owner_id = auth.uid();

create or replace view public.merchant_order_audit_projection
with (security_invoker = true)
as
select
  ae.id as event_id,
  ae.payment_attempt_id as order_id,
  ae.occurred_at,
  ae.actor_type,
  ae.event_type,
  ae.metadata
from public.audit_events ae
join public.payment_attempts pa on pa.id = ae.payment_attempt_id
join public.products p on p.id = pa.product_id
where p.owner_id = auth.uid();

create or replace view public.merchant_catalog_projection
with (security_invoker = true)
as
select
  p.id as product_id,
  p.slug,
  p.name,
  p.description,
  p.status,
  p.metadata,
  o.amount_minor,
  o.currency,
  o.scale,
  coalesce(o.active, false) as offering_active,
  coalesce(e.enabled, false) as endpoint_enabled,
  p.updated_at
from public.products p
left join public.product_payment_offerings o on o.product_id = p.id and o.rail = 'stripe_mpp'
left join public.product_endpoints e on e.offering_id = o.id
where p.owner_id = auth.uid();

create or replace view public.merchant_finance_projection
with (security_invoker = true)
as
select
  orders.*,
  orders.receipt ->> 'reference' as receipt_reference,
  orders.receipt ->> 'method' as receipt_method,
  latest_case.status as refund_case_status
from public.merchant_orders_projection orders
left join lateral (
  select rc.status
  from public.refund_cases rc
  where rc.payment_attempt_id = orders.order_id and rc.owner_id = auth.uid()
  order by rc.created_at desc limit 1
) latest_case on true
where orders.status in ('settled', 'refunded');

create or replace view public.merchant_refund_cases_projection
with (security_invoker = true)
as
select
  rc.id as refund_case_id,
  rc.payment_attempt_id,
  p.name as product_name,
  rc.amount_minor,
  rc.currency,
  rc.reason,
  rc.note,
  rc.status,
  rc.created_at,
  rc.updated_at
from public.refund_cases rc
join public.payment_attempts pa on pa.id = rc.payment_attempt_id
join public.products p on p.id = pa.product_id
where rc.owner_id = auth.uid() and p.owner_id = auth.uid();

revoke all on public.merchant_dashboard_projection, public.merchant_daily_sales_projection,
  public.merchant_orders_projection, public.merchant_order_audit_projection,
  public.merchant_catalog_projection, public.merchant_finance_projection,
  public.merchant_refund_cases_projection from public, anon;
grant select on public.merchant_dashboard_projection, public.merchant_daily_sales_projection,
  public.merchant_orders_projection, public.merchant_order_audit_projection,
  public.merchant_catalog_projection, public.merchant_finance_projection,
  public.merchant_refund_cases_projection to authenticated;

create or replace function public.create_merchant_product(
  p_owner_id uuid,
  p_name text,
  p_slug text,
  p_description text,
  p_amount_minor bigint,
  p_currency text,
  p_metadata jsonb,
  p_network_id text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  product_id uuid;
  offering_id uuid;
begin
  if p_name is null or char_length(trim(p_name)) < 2 then raise exception 'Product name is invalid.'; end if;
  if p_slug is null or p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then raise exception 'Product slug is invalid.'; end if;
  if p_description is null or char_length(trim(p_description)) < 10 then raise exception 'Product description is invalid.'; end if;
  if p_amount_minor is null or p_amount_minor <= 0 or p_currency <> 'usd' then raise exception 'A positive fixed USD price is required.'; end if;
  if p_metadata is null or jsonb_typeof(p_metadata) <> 'object' or p_metadata = '{}'::jsonb then raise exception 'Structured metadata is required.'; end if;
  if p_network_id is null or trim(p_network_id) = '' then raise exception 'Payment network is not configured.'; end if;

  insert into public.products (owner_id, slug, name, description, status, metadata)
  values (p_owner_id, p_slug, trim(p_name), trim(p_description), 'draft', p_metadata)
  returning id into product_id;

  insert into public.product_payment_offerings (product_id, rail, amount_minor, currency, scale, network_id, active)
  values (product_id, 'stripe_mpp', p_amount_minor, 'usd', 2, p_network_id, false)
  returning id into offering_id;

  insert into public.product_endpoints (offering_id, method, path, response_status, response_body, enabled)
  values (offering_id, 'GET', '/v1/products/' || p_slug || '/mpp', 200, jsonb_build_object('product', p_slug), false);

  insert into public.audit_events (actor_type, event_type, product_id, offering_id, metadata)
  values ('operator', 'merchant_product_draft_created', product_id, offering_id, jsonb_build_object('owner_id', p_owner_id));
  return product_id;
end;
$$;

create or replace function public.publish_merchant_product(p_owner_id uuid, p_product_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offering_id uuid;
begin
  select o.id into v_offering_id
  from public.products p
  join public.product_payment_offerings o on o.product_id = p.id and o.rail = 'stripe_mpp'
  join public.product_endpoints e on e.offering_id = o.id
  where p.id = p_product_id and p.owner_id = p_owner_id and p.status = 'draft'
    and p.metadata <> '{}'::jsonb and o.amount_minor > 0 and o.currency = 'usd'
  for update of p, o, e;
  if v_offering_id is null then raise exception 'Owned publishable draft was not found.'; end if;

  update public.products set status = 'published' where id = p_product_id;
  update public.product_payment_offerings set active = true where id = v_offering_id;
  update public.product_endpoints set enabled = true where offering_id = v_offering_id;
  insert into public.audit_events (actor_type, event_type, product_id, offering_id, metadata)
  values ('operator', 'merchant_product_published', p_product_id, v_offering_id, jsonb_build_object('owner_id', p_owner_id));
  return true;
end;
$$;

create or replace function public.create_merchant_refund_case(
  p_owner_id uuid,
  p_payment_attempt_id uuid,
  p_amount_minor bigint,
  p_reason text,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  attempt public.payment_attempts;
  refund_case_id uuid;
  requested_amount bigint;
begin
  select pa.* into attempt
  from public.payment_attempts pa
  join public.products p on p.id = pa.product_id
  where pa.id = p_payment_attempt_id and p.owner_id = p_owner_id and pa.status = 'settled'
  for update of pa;
  if attempt.id is null then raise exception 'Owned settled payment attempt was not found.'; end if;
  requested_amount := coalesce(p_amount_minor, attempt.amount_minor);
  if requested_amount <= 0 or requested_amount > attempt.amount_minor then raise exception 'Requested amount exceeds the receipt total.'; end if;
  if p_reason not in ('duplicate', 'fraudulent', 'requested_by_customer') then raise exception 'Refund reason is invalid.'; end if;
  if p_note is not null and char_length(p_note) > 500 then raise exception 'Refund note is too long.'; end if;

  insert into public.refund_cases (owner_id, payment_attempt_id, amount_minor, currency, reason, note)
  values (p_owner_id, attempt.id, requested_amount, attempt.currency, p_reason, nullif(trim(p_note), ''))
  returning id into refund_case_id;
  insert into public.audit_events (actor_type, event_type, product_id, offering_id, endpoint_id, payment_attempt_id, metadata)
  values ('operator', 'merchant_refund_case_requested', attempt.product_id, attempt.offering_id, attempt.endpoint_id, attempt.id, jsonb_build_object('refund_case_id', refund_case_id, 'amount_minor', requested_amount));
  return refund_case_id;
end;
$$;

revoke all on function public.create_merchant_product(uuid, text, text, text, bigint, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.publish_merchant_product(uuid, uuid) from public, anon, authenticated;
revoke all on function public.create_merchant_refund_case(uuid, uuid, bigint, text, text) from public, anon, authenticated;
grant execute on function public.create_merchant_product(uuid, text, text, text, bigint, text, jsonb, text) to service_role;
grant execute on function public.publish_merchant_product(uuid, uuid) to service_role;
grant execute on function public.create_merchant_refund_case(uuid, uuid, bigint, text, text) to service_role;

create or replace function public.record_payment_attempt(
  p_product_id uuid,
  p_offering_id uuid,
  p_endpoint_id uuid,
  p_rail text,
  p_provider_payment_id text,
  p_idempotency_key uuid,
  p_status text,
  p_amount_minor bigint,
  p_currency text,
  p_scale smallint,
  p_request_fingerprint text default null,
  p_agent_execution_proof_id uuid default null,
  p_receipt jsonb default null,
  p_failure_code text default null
)
returns public.payment_attempts
language plpgsql
security definer
set search_path = public
as $$
declare
  attempt public.payment_attempts;
begin
  if p_agent_execution_proof_id is null then raise exception 'An agent execution proof is required for payment recording.'; end if;
  insert into public.payment_attempts (
    product_id, offering_id, endpoint_id, rail, provider_payment_id, idempotency_key,
    status, amount_minor, currency, scale, request_fingerprint, agent_execution_proof_id,
    receipt, failure_code, settled_at
  ) values (
    p_product_id, p_offering_id, p_endpoint_id, p_rail, p_provider_payment_id, p_idempotency_key,
    p_status, p_amount_minor, p_currency, p_scale, p_request_fingerprint, p_agent_execution_proof_id,
    p_receipt, p_failure_code, case when p_status = 'settled' then now() else null end
  )
  on conflict (offering_id, idempotency_key) do update set
    provider_payment_id = coalesce(excluded.provider_payment_id, payment_attempts.provider_payment_id),
    status = excluded.status,
    request_fingerprint = coalesce(excluded.request_fingerprint, payment_attempts.request_fingerprint),
    receipt = coalesce(excluded.receipt, payment_attempts.receipt),
    failure_code = excluded.failure_code,
    settled_at = case when excluded.status = 'settled' then coalesce(payment_attempts.settled_at, now()) else null end
  returning * into attempt;

  insert into public.audit_events (actor_type, event_type, product_id, offering_id, endpoint_id, payment_attempt_id, metadata)
  values ('service', 'payment_attempt_' || attempt.status, attempt.product_id, attempt.offering_id, attempt.endpoint_id, attempt.id,
    jsonb_build_object('rail', attempt.rail, 'status', attempt.status, 'agent_execution_proof_id', attempt.agent_execution_proof_id));
  return attempt;
end;
$$;

revoke all on function public.record_payment_attempt(uuid, uuid, uuid, text, text, uuid, text, bigint, text, smallint, text, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.record_payment_attempt(uuid, uuid, uuid, text, text, uuid, text, bigint, text, smallint, text, uuid, jsonb, text) to service_role;
