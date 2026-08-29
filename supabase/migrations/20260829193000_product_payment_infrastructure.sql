create extension if not exists pgcrypto;

create table public.products (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete set null,
  slug text not null unique,
  name text not null,
  description text not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create table public.product_payment_offerings (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  rail text not null check (rail = 'stripe_mpp'),
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null,
  scale smallint not null check (scale between 0 and 18),
  network_id text,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, rail),
  check (currency = 'usd' and scale = 2 and network_id is not null)
);

create table public.product_endpoints (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references public.product_payment_offerings(id) on delete cascade,
  method text not null check (method in ('GET', 'POST')),
  path text not null,
  response_status integer not null default 200 check (response_status between 200 and 299),
  response_body jsonb not null,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (method, path),
  check (path ~ '^/[a-zA-Z0-9._~!$&''()*+,;=:@/%-]*$')
);

create table public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  offering_id uuid not null references public.product_payment_offerings(id) on delete restrict,
  endpoint_id uuid not null references public.product_endpoints(id) on delete restrict,
  rail text not null check (rail = 'stripe_mpp'),
  provider_payment_id text,
  idempotency_key uuid not null,
  status text not null check (status in ('challenged', 'settled', 'failed', 'refunded')),
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null,
  scale smallint not null check (scale between 0 and 18),
  request_fingerprint text,
  receipt jsonb,
  failure_code text,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (offering_id, idempotency_key),
  unique (rail, provider_payment_id),
  check ((status = 'settled') = (settled_at is not null))
);

create table public.access_grants (
  id uuid primary key default gen_random_uuid(),
  payment_attempt_id uuid not null references public.payment_attempts(id) on delete restrict,
  endpoint_id uuid not null references public.product_endpoints(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'revoked', 'expired')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (payment_attempt_id, endpoint_id),
  check ((status = 'revoked') = (revoked_at is not null))
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_type text not null check (actor_type in ('system', 'service', 'operator')),
  event_type text not null,
  product_id uuid references public.products(id) on delete restrict,
  offering_id uuid references public.product_payment_offerings(id) on delete restrict,
  endpoint_id uuid references public.product_endpoints(id) on delete restrict,
  payment_attempt_id uuid references public.payment_attempts(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb
);

create index product_payment_offerings_active_product_idx
  on public.product_payment_offerings (product_id)
  where active;
create index product_endpoints_enabled_path_idx
  on public.product_endpoints (method, path)
  where enabled;
create index payment_attempts_provider_payment_idx
  on public.payment_attempts (rail, provider_payment_id)
  where provider_payment_id is not null;
create index payment_attempts_created_at_idx
  on public.payment_attempts (created_at desc);
create index audit_events_payment_attempt_idx
  on public.audit_events (payment_attempt_id, occurred_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger products_set_updated_at
before update on public.products
for each row execute function public.set_updated_at();

create trigger product_payment_offerings_set_updated_at
before update on public.product_payment_offerings
for each row execute function public.set_updated_at();

create trigger product_endpoints_set_updated_at
before update on public.product_endpoints
for each row execute function public.set_updated_at();

create trigger payment_attempts_set_updated_at
before update on public.payment_attempts
for each row execute function public.set_updated_at();

alter table public.products enable row level security;
alter table public.product_payment_offerings enable row level security;
alter table public.product_endpoints enable row level security;
alter table public.payment_attempts enable row level security;
alter table public.access_grants enable row level security;
alter table public.audit_events enable row level security;

create policy "Published products are readable"
on public.products for select
to anon, authenticated
using (status = 'published');

create policy "Active offerings for published products are readable"
on public.product_payment_offerings for select
to anon, authenticated
using (
  active
  and exists (
    select 1 from public.products
    where products.id = product_payment_offerings.product_id
      and products.status = 'published'
  )
);

create policy "Enabled endpoints for active published offerings are readable"
on public.product_endpoints for select
to anon, authenticated
using (
  enabled
  and exists (
    select 1
    from public.product_payment_offerings
    join public.products on products.id = product_payment_offerings.product_id
    where product_payment_offerings.id = product_endpoints.offering_id
      and product_payment_offerings.active
      and products.status = 'published'
  )
);

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
  insert into public.payment_attempts (
    product_id,
    offering_id,
    endpoint_id,
    rail,
    provider_payment_id,
    idempotency_key,
    status,
    amount_minor,
    currency,
    scale,
    request_fingerprint,
    receipt,
    failure_code,
    settled_at
  ) values (
    p_product_id,
    p_offering_id,
    p_endpoint_id,
    p_rail,
    p_provider_payment_id,
    p_idempotency_key,
    p_status,
    p_amount_minor,
    p_currency,
    p_scale,
    p_request_fingerprint,
    p_receipt,
    p_failure_code,
    case when p_status = 'settled' then now() else null end
  )
  on conflict (offering_id, idempotency_key) do nothing
  returning * into attempt;

  if attempt.id is null then
    select * into attempt
    from public.payment_attempts
    where offering_id = p_offering_id
      and idempotency_key = p_idempotency_key;
    return attempt;
  end if;

  insert into public.audit_events (
    actor_type,
    event_type,
    product_id,
    offering_id,
    endpoint_id,
    payment_attempt_id,
    metadata
  ) values (
    'service',
    'payment_attempt_recorded',
    attempt.product_id,
    attempt.offering_id,
    attempt.endpoint_id,
    attempt.id,
    jsonb_build_object('rail', attempt.rail, 'status', attempt.status)
  );

  return attempt;
end;
$$;

revoke all on function public.record_payment_attempt from public, anon, authenticated;
grant execute on function public.record_payment_attempt to service_role;
