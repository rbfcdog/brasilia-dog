create table public.agent_identities (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  display_name text not null check (char_length(display_name) between 1 and 120),
  status text not null default 'active' check (status in ('active', 'suspended', 'revoked')),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  check ((status = 'revoked') = (revoked_at is not null))
);

create table public.agent_signing_keys (
  id uuid primary key default gen_random_uuid(),
  agent_identity_id uuid not null references public.agent_identities(id) on delete restrict,
  algorithm text not null check (algorithm = 'Ed25519'),
  custody text not null check (custody = 'server_kms'),
  key_reference text not null unique,
  public_key_jwk jsonb not null,
  public_key_fingerprint text not null unique check (public_key_fingerprint ~ '^[a-f0-9]{64}$'),
  status text not null default 'active' check (status in ('active', 'retired', 'revoked')),
  not_before timestamptz not null default now(),
  not_after timestamptz,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  check ((status = 'revoked') = (revoked_at is not null)),
  check (jsonb_typeof(public_key_jwk) = 'object')
);

create unique index agent_signing_keys_one_active_key_idx
  on public.agent_signing_keys (agent_identity_id)
  where status = 'active';

create table public.mandates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  agent_identity_id uuid not null references public.agent_identities(id) on delete restrict,
  version integer not null default 1 check (version > 0),
  status text not null default 'active' check (status in ('active', 'revoked', 'expired')),
  scope jsonb not null,
  max_amount_minor bigint not null check (max_amount_minor > 0),
  currency text not null check (currency = 'usd'),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  check ((status = 'revoked') = (revoked_at is not null)),
  check (expires_at > created_at),
  check (jsonb_typeof(scope) = 'object')
);

create index mandates_active_agent_idx
  on public.mandates (agent_identity_id, expires_at)
  where status = 'active';

create table public.agent_execution_proofs (
  id uuid primary key default gen_random_uuid(),
  agent_identity_id uuid not null references public.agent_identities(id) on delete restrict,
  agent_signing_key_id uuid not null references public.agent_signing_keys(id) on delete restrict,
  mandate_id uuid not null references public.mandates(id) on delete restrict,
  mandate_version integer not null check (mandate_version > 0),
  request_method text not null check (request_method in ('GET', 'POST')),
  request_path text not null check (request_path ~ '^/[a-zA-Z0-9._~!$&''()*+,;=:@/%-]*$'),
  request_body_sha256 text not null check (request_body_sha256 ~ '^[a-f0-9]{64}$'),
  nonce text not null unique check (nonce ~ '^[A-Za-z0-9_-]+$'),
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  signature text not null,
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (expires_at > issued_at),
  check (expires_at <= issued_at + interval '5 minutes')
);

create index agent_execution_proofs_mandate_idx
  on public.agent_execution_proofs (mandate_id, created_at desc);

alter table public.payment_attempts
  add column agent_execution_proof_id uuid references public.agent_execution_proofs(id) on delete restrict;

create unique index payment_attempts_agent_execution_proof_idx
  on public.payment_attempts (agent_execution_proof_id)
  where agent_execution_proof_id is not null;

alter table public.agent_identities enable row level security;
alter table public.agent_signing_keys enable row level security;
alter table public.mandates enable row level security;
alter table public.agent_execution_proofs enable row level security;

create policy "Owners read their agent identities"
on public.agent_identities for select
to authenticated
using (owner_id = auth.uid());

create policy "Owners read their mandates"
on public.mandates for select
to authenticated
using (owner_id = auth.uid());

create or replace function public.record_agent_execution_proof(
  p_agent_identity_id uuid,
  p_agent_signing_key_id uuid,
  p_mandate_id uuid,
  p_mandate_version integer,
  p_request_method text,
  p_request_path text,
  p_request_body_sha256 text,
  p_nonce text,
  p_issued_at timestamptz,
  p_expires_at timestamptz,
  p_signature text
)
returns public.agent_execution_proofs
language plpgsql
security definer
set search_path = public
as $$
declare
  proof public.agent_execution_proofs;
begin
  if not exists (
    select 1
    from public.agent_identities as agent
    join public.agent_signing_keys as key on key.agent_identity_id = agent.id
    join public.mandates as mandate on mandate.agent_identity_id = agent.id
    where agent.id = p_agent_identity_id
      and agent.status = 'active'
      and key.id = p_agent_signing_key_id
      and key.status = 'active'
      and key.not_before <= now()
      and (key.not_after is null or key.not_after > now())
      and mandate.id = p_mandate_id
      and mandate.version = p_mandate_version
      and mandate.status = 'active'
      and mandate.expires_at > now()
  ) then
    raise exception 'Agent identity, signing key, or mandate is not active.';
  end if;

  insert into public.agent_execution_proofs (
    agent_identity_id,
    agent_signing_key_id,
    mandate_id,
    mandate_version,
    request_method,
    request_path,
    request_body_sha256,
    nonce,
    issued_at,
    expires_at,
    signature
  ) values (
    p_agent_identity_id,
    p_agent_signing_key_id,
    p_mandate_id,
    p_mandate_version,
    p_request_method,
    p_request_path,
    p_request_body_sha256,
    p_nonce,
    p_issued_at,
    p_expires_at,
    p_signature
  )
  on conflict (nonce) do nothing
  returning * into proof;

  if proof.id is null then
    raise exception 'Agent proof nonce has already been used.';
  end if;

  insert into public.audit_events (
    actor_type,
    event_type,
    metadata
  ) values (
    'service',
    'agent_execution_proof_verified',
    jsonb_build_object(
      'agent_identity_id', proof.agent_identity_id,
      'agent_signing_key_id', proof.agent_signing_key_id,
      'mandate_id', proof.mandate_id,
      'mandate_version', proof.mandate_version,
      'agent_execution_proof_id', proof.id
    )
  );

  return proof;
end;
$$;

revoke all on function public.record_agent_execution_proof from public, anon, authenticated;
grant execute on function public.record_agent_execution_proof to service_role;
