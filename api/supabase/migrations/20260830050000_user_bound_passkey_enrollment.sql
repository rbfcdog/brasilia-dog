-- Single-use, short-lived grants for cross-device passkey registration.
-- Raw enrollment tokens are never stored; only SHA-256 hashes are persisted.
create table public.passkey_enrollment_grants (
  token_hash text primary key check (char_length(token_hash) = 64),
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create index passkey_enrollment_grants_user_expires_idx
  on public.passkey_enrollment_grants (user_id, expires_at desc);

alter table public.passkey_enrollment_grants enable row level security;
revoke all on public.passkey_enrollment_grants from public, anon, authenticated;
grant all on public.passkey_enrollment_grants to service_role;
