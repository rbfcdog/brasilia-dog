alter table public.mandates
  add column if not exists creation_idempotency_key uuid,
  add column if not exists creation_body_sha256 text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'mandates_creation_body_sha256_check') then
    alter table public.mandates add constraint mandates_creation_body_sha256_check
    check (creation_body_sha256 is null or creation_body_sha256 ~ '^[a-f0-9]{64}$');
  end if;
end $$;

create unique index if not exists mandates_owner_creation_idempotency_idx
  on public.mandates (owner_id, creation_idempotency_key)
  where creation_idempotency_key is not null;

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  mandate_id uuid not null references public.mandates(id) on delete restrict,
  goal text not null check (char_length(goal) between 1 and 2000),
  conversation_id uuid references public.conversations(id) on delete set null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'monitoring', 'waiting_for_extension', 'completed', 'rejected', 'failed')),
  start_idempotency_key uuid not null,
  start_body_sha256 text not null check (start_body_sha256 ~ '^[a-f0-9]{64}$'),
  next_poll_at timestamptz,
  lease_owner text,
  lease_until timestamptz,
  state jsonb not null default '{}'::jsonb check (jsonb_typeof(state) = 'object'),
  result jsonb check (result is null or jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, start_idempotency_key)
);

create index agent_runs_due_idx
  on public.agent_runs (next_poll_at)
  where status in ('queued', 'monitoring');
create index agent_runs_owner_created_idx on public.agent_runs (owner_id, created_at desc);
create unique index agent_runs_one_active_per_mandate_idx
  on public.agent_runs (mandate_id)
  where status in ('queued', 'running', 'monitoring', 'waiting_for_extension');

create table public.agent_run_events (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  sequence integer not null check (sequence > 0),
  type text not null check (char_length(type) between 1 and 80),
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  occurred_at timestamptz not null default now(),
  unique (run_id, sequence)
);

create index agent_run_events_run_sequence_idx on public.agent_run_events (run_id, sequence);

create table public.mandate_extensions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.agent_runs(id) on delete restrict,
  mandate_id uuid not null references public.mandates(id) on delete restrict,
  owner_id uuid not null references auth.users(id) on delete restrict,
  idempotency_key uuid not null,
  previous_version integer not null check (previous_version > 0),
  new_version integer not null check (new_version = previous_version + 1),
  previous_expires_at timestamptz not null,
  new_expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (owner_id, idempotency_key)
);

alter table public.agent_runs enable row level security;
alter table public.agent_run_events enable row level security;
alter table public.mandate_extensions enable row level security;

revoke all on public.agent_runs, public.agent_run_events, public.mandate_extensions from public, anon, authenticated;
grant all on public.agent_runs, public.agent_run_events, public.mandate_extensions to service_role;

create or replace function public.claim_due_agent_runs(
  p_worker_id text,
  p_limit integer default 5,
  p_lease_seconds integer default 15
)
returns setof public.agent_runs
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_worker_id is null or char_length(trim(p_worker_id)) < 1 then
    raise exception 'A worker ID is required.';
  end if;
  if p_limit < 1 or p_limit > 25 or p_lease_seconds < 5 or p_lease_seconds > 300 then
    raise exception 'Claim bounds are invalid.';
  end if;

  return query
  with due as (
    select id
    from public.agent_runs
    where status in ('queued', 'running', 'monitoring')
      and coalesce(next_poll_at, now()) <= now()
      and (lease_until is null or lease_until <= now())
    order by coalesce(next_poll_at, created_at), created_at
    for update skip locked
    limit p_limit
  )
  update public.agent_runs runs
  set status = 'running',
      lease_owner = p_worker_id,
      lease_until = now() + make_interval(secs => p_lease_seconds),
      updated_at = now()
  from due
  where runs.id = due.id
  returning runs.*;
end;
$$;

revoke all on function public.claim_due_agent_runs(text, integer, integer) from public, anon, authenticated;
grant execute on function public.claim_due_agent_runs(text, integer, integer) to service_role;

create or replace function public.extend_mandate_for_run(
  p_owner_id uuid,
  p_run_id uuid,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_extension public.mandate_extensions;
  target_run public.agent_runs;
  target_mandate public.mandates;
  extension_seconds integer;
  new_expiry timestamptz;
begin
  select * into existing_extension
  from public.mandate_extensions
  where owner_id = p_owner_id and idempotency_key = p_idempotency_key;

  if existing_extension.id is not null then
    if existing_extension.run_id <> p_run_id then
      raise exception 'The idempotency key was used for another extension.';
    end if;
    return jsonb_build_object(
      'extensionId', existing_extension.id,
      'mandateId', existing_extension.mandate_id,
      'version', existing_extension.new_version,
      'expiresAt', existing_extension.new_expires_at
    );
  end if;

  select * into target_run
  from public.agent_runs
  where id = p_run_id and owner_id = p_owner_id
  for update;

  if target_run.id is null or target_run.status <> 'waiting_for_extension' then
    raise exception 'The owned run is not waiting for extension.';
  end if;

  select * into target_mandate
  from public.mandates
  where id = target_run.mandate_id and owner_id = p_owner_id
  for update;

  if target_mandate.id is null or target_mandate.status = 'revoked' then
    raise exception 'The mandate cannot be extended.';
  end if;

  extension_seconds := coalesce((target_mandate.scope ->> 'searchWindowSeconds')::integer, 60);
  if extension_seconds < 10 or extension_seconds > 86400 then
    raise exception 'The mandate search window is invalid.';
  end if;
  new_expiry := greatest(now(), target_mandate.expires_at) + make_interval(secs => extension_seconds);

  update public.mandates
  set version = version + 1,
      status = 'active',
      expires_at = new_expiry
  where id = target_mandate.id;

  insert into public.mandate_extensions (
    run_id, mandate_id, owner_id, idempotency_key,
    previous_version, new_version, previous_expires_at, new_expires_at
  ) values (
    target_run.id, target_mandate.id, p_owner_id, p_idempotency_key,
    target_mandate.version, target_mandate.version + 1, target_mandate.expires_at, new_expiry
  ) returning * into existing_extension;

  insert into public.audit_events (actor_type, event_type, metadata)
  values ('user', 'mandate_extended', jsonb_build_object(
    'run_id', target_run.id,
    'mandate_id', target_mandate.id,
    'extension_id', existing_extension.id,
    'previous_version', target_mandate.version,
    'new_version', target_mandate.version + 1,
    'new_expires_at', new_expiry
  ));

  return jsonb_build_object(
    'extensionId', existing_extension.id,
    'mandateId', target_mandate.id,
    'version', target_mandate.version + 1,
    'expiresAt', new_expiry
  );
end;
$$;

revoke all on function public.extend_mandate_for_run(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.extend_mandate_for_run(uuid, uuid, uuid) to service_role;

create or replace function public.ensure_agent_identity(
  p_owner_id uuid,
  p_display_name text,
  p_public_key_jwk jsonb,
  p_public_key_fingerprint text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  identity_row public.agent_identities;
  key_row public.agent_signing_keys;
begin
  select agent.* into identity_row
  from public.agent_signing_keys key
  join public.agent_identities agent on agent.id = key.agent_identity_id
  where key.public_key_fingerprint = p_public_key_fingerprint;
  select key.* into key_row
  from public.agent_signing_keys key
  where key.public_key_fingerprint = p_public_key_fingerprint;

  if identity_row.id is null then
    begin
      insert into public.agent_identities (owner_id, display_name)
      values (p_owner_id, p_display_name)
      returning * into identity_row;

      insert into public.agent_signing_keys (
        agent_identity_id, algorithm, custody, key_reference,
        public_key_jwk, public_key_fingerprint
      ) values (
        identity_row.id, 'Ed25519', 'agent_managed',
        'agent-key-' || p_public_key_fingerprint,
        p_public_key_jwk, p_public_key_fingerprint
      ) returning * into key_row;
    exception when unique_violation then
      select agent.* into identity_row
      from public.agent_signing_keys key
      join public.agent_identities agent on agent.id = key.agent_identity_id
      where key.public_key_fingerprint = p_public_key_fingerprint;
      select * into key_row from public.agent_signing_keys
      where public_key_fingerprint = p_public_key_fingerprint;
    end;
  end if;

  if identity_row.owner_id <> p_owner_id then
    raise exception 'The signing key belongs to another owner.';
  end if;
  if identity_row.status <> 'active' or key_row.status <> 'active'
    or key_row.public_key_jwk <> p_public_key_jwk then
    raise exception 'The registered agent key is not active or does not match.';
  end if;

  return jsonb_build_object(
    'identity', jsonb_build_object(
      'id', identity_row.id,
      'ownerId', identity_row.owner_id,
      'displayName', identity_row.display_name,
      'status', identity_row.status,
      'createdAt', identity_row.created_at
    ),
    'signingKey', jsonb_build_object(
      'id', key_row.id,
      'agentIdentityId', key_row.agent_identity_id,
      'algorithm', key_row.algorithm,
      'publicKeyJwk', key_row.public_key_jwk,
      'fingerprint', key_row.public_key_fingerprint,
      'status', key_row.status
    )
  );
end;
$$;

revoke all on function public.ensure_agent_identity(uuid, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.ensure_agent_identity(uuid, text, jsonb, text) to service_role;

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
    select products.slug, offerings.amount_minor,
      case when nullif(btrim(p_query), '') is null then 0
        else ts_rank_cd(products.search_document, websearch_to_tsquery('simple', p_query)) end as rank,
      jsonb_build_object(
        'id', products.id, 'slug', products.slug, 'name', products.name,
        'description', products.description, 'status', products.status,
        'metadata', products.metadata,
        'merchant', case when merchants.user_id is null then null else jsonb_build_object(
          'id', merchants.user_id, 'businessName', merchants.business_name, 'status', merchants.status
        ) end,
        'offering', jsonb_build_object(
          'id', offerings.id, 'rail', offerings.rail, 'amountMinor', offerings.amount_minor,
          'currency', offerings.currency, 'scale', offerings.scale,
          'networkId', offerings.network_id, 'active', offerings.active
        ),
        'endpoint', jsonb_build_object(
          'id', endpoints.id, 'method', endpoints.method, 'path', endpoints.path, 'enabled', endpoints.enabled
        )
      ) as entry
    from public.products products
    join public.product_payment_offerings offerings on offerings.product_id = products.id
    join public.product_endpoints endpoints on endpoints.offering_id = offerings.id
    left join public.merchant_profiles merchants on merchants.user_id = products.owner_id
    where products.status = 'published'
      and offerings.rail = 'stripe_mpp' and offerings.active and endpoints.enabled
      and (nullif(btrim(p_category), '') is null
        or lower(products.metadata->>'category') = lower(btrim(p_category)))
      and (p_maximum_amount_minor is null or offerings.amount_minor <= p_maximum_amount_minor)
      and (coalesce(array_length(p_slugs, 1), 0) = 0 or products.slug = any(p_slugs))
    order by rank desc, offerings.amount_minor asc, products.slug asc
    limit least(greatest(p_limit, 1), 25)
  ) result;
$$;

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
    from public.agent_identities agent
    join public.agent_signing_keys key on key.agent_identity_id = agent.id
    join public.mandates mandate on mandate.agent_identity_id = agent.id
    where agent.id = p_agent_identity_id and agent.status = 'active'
      and key.id = p_agent_signing_key_id and key.status = 'active'
      and key.not_before <= now() and (key.not_after is null or key.not_after > now())
      and mandate.id = p_mandate_id and mandate.version = p_mandate_version
      and mandate.status = 'active' and mandate.expires_at > now()
  ) then
    raise exception 'Agent identity, signing key, or mandate is not active.';
  end if;

  insert into public.agent_execution_proofs (
    agent_identity_id, agent_signing_key_id, mandate_id, mandate_version,
    request_method, request_path, request_body_sha256, nonce,
    issued_at, expires_at, signature
  ) values (
    p_agent_identity_id, p_agent_signing_key_id, p_mandate_id, p_mandate_version,
    p_request_method, p_request_path, p_request_body_sha256, p_nonce,
    p_issued_at, p_expires_at, p_signature
  )
  on conflict (nonce) do nothing
  returning * into proof;

  if proof.id is null then
    select * into proof from public.agent_execution_proofs where nonce = p_nonce;
    if proof.agent_identity_id is distinct from p_agent_identity_id
      or proof.agent_signing_key_id is distinct from p_agent_signing_key_id
      or proof.mandate_id is distinct from p_mandate_id
      or proof.mandate_version is distinct from p_mandate_version
      or proof.request_method is distinct from p_request_method
      or proof.request_path is distinct from p_request_path
      or proof.request_body_sha256 is distinct from p_request_body_sha256
      or proof.issued_at is distinct from p_issued_at
      or proof.expires_at is distinct from p_expires_at
      or proof.signature is distinct from p_signature then
      raise exception 'Agent proof nonce has already been used.';
    end if;
    return proof;
  end if;

  insert into public.audit_events (actor_type, event_type, metadata)
  values ('service', 'agent_execution_proof_verified', jsonb_build_object(
    'agent_identity_id', proof.agent_identity_id,
    'agent_signing_key_id', proof.agent_signing_key_id,
    'mandate_id', proof.mandate_id,
    'mandate_version', proof.mandate_version,
    'agent_execution_proof_id', proof.id
  ));
  return proof;
end;
$$;

revoke all on function public.record_agent_execution_proof from public, anon, authenticated;
grant execute on function public.record_agent_execution_proof to service_role;
