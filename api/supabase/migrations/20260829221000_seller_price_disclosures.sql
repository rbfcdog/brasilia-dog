create table public.merchant_integrations (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(display_name) between 1 and 120),
  api_key_hash text not null unique check (api_key_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'active' check (status in ('active', 'suspended', 'revoked')),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  check ((status = 'revoked') = (revoked_at is not null))
);

create table public.seller_quote_requests (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant_integrations(id) on delete restrict,
  owner_id uuid not null references auth.users(id) on delete restrict,
  agent_identity_id uuid not null references public.agent_identities(id) on delete restrict,
  mandate_id uuid not null references public.mandates(id) on delete restrict,
  credential_commitment text not null check (credential_commitment ~ '^[a-f0-9]{64}$'),
  agent_verification_hash text not null check (agent_verification_hash ~ '^[a-f0-9]{64}$'),
  price_limit_minor bigint not null check (price_limit_minor > 0),
  currency text not null check (currency = 'usd'),
  requirements jsonb not null default '[]'::jsonb check (jsonb_typeof(requirements) = 'array'),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create index seller_quote_requests_merchant_expiry_idx
  on public.seller_quote_requests (merchant_id, expires_at desc);

alter table public.merchant_integrations enable row level security;
alter table public.seller_quote_requests enable row level security;

create or replace function public.record_seller_quote_request(
  p_merchant_id uuid,
  p_owner_id uuid,
  p_agent_identity_id uuid,
  p_mandate_id uuid,
  p_credential_commitment text,
  p_agent_verification_hash text,
  p_price_limit_minor bigint,
  p_currency text,
  p_requirements jsonb,
  p_expires_at timestamptz
)
returns public.seller_quote_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  quote_request public.seller_quote_requests;
begin
  if not exists (
    select 1
    from public.merchant_integrations
    where id = p_merchant_id and status = 'active'
  ) then
    raise exception 'Seller integration is not active.';
  end if;

  insert into public.seller_quote_requests (
    merchant_id,
    owner_id,
    agent_identity_id,
    mandate_id,
    credential_commitment,
    agent_verification_hash,
    price_limit_minor,
    currency,
    requirements,
    expires_at
  ) values (
    p_merchant_id,
    p_owner_id,
    p_agent_identity_id,
    p_mandate_id,
    p_credential_commitment,
    p_agent_verification_hash,
    p_price_limit_minor,
    p_currency,
    p_requirements,
    p_expires_at
  ) returning * into quote_request;

  insert into public.audit_events (
    actor_type,
    event_type,
    metadata
  ) values (
    'service',
    'seller_quote_request_disclosed',
    jsonb_build_object(
      'seller_quote_request_id', quote_request.id,
      'merchant_id', quote_request.merchant_id,
      'agent_identity_id', quote_request.agent_identity_id,
      'mandate_id', quote_request.mandate_id,
      'price_limit_minor', quote_request.price_limit_minor
    )
  );

  return quote_request;
end;
$$;

revoke all on function public.record_seller_quote_request from public, anon, authenticated;
grant execute on function public.record_seller_quote_request to service_role;
