-- Reconcile the single-use cross-device passkey enrollment store for projects
-- that were provisioned before the initial enrollment migration was applied.
-- Raw enrollment tokens never reach this table; only SHA-256 token hashes do.

create table if not exists public.passkey_enrollment_grants (
  token_hash text primary key check (char_length(token_hash) = 64),
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create index if not exists passkey_enrollment_grants_user_expires_idx
  on public.passkey_enrollment_grants (user_id, expires_at desc);

alter table public.passkey_enrollment_grants enable row level security;
revoke all on public.passkey_enrollment_grants from public, anon, authenticated;
drop policy if exists passkey_enrollment_grants_service_role_access on public.passkey_enrollment_grants;
create policy passkey_enrollment_grants_service_role_access
on public.passkey_enrollment_grants
for all
to service_role
using (true)
with check (true);
grant select, insert, update, delete on public.passkey_enrollment_grants to service_role;
