-- Reconcile durable passkey storage for deployments that missed the original
-- migration because earlier migration files reused the same version prefix.
-- Raw challenges and passkey session tokens are never stored outside this
-- server-only persistence boundary.

create table if not exists public.passkey_challenges (
  user_id uuid primary key references auth.users(id) on delete cascade,
  challenge text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.passkey_sessions (
  token_hash text primary key check (char_length(token_hash) = 64),
  user_id uuid not null references auth.users(id) on delete cascade,
  credential_id text not null references public.passkey_credentials(credential_id) on delete cascade,
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (expires_at > issued_at)
);

create index if not exists passkey_sessions_user_expires_idx
  on public.passkey_sessions (user_id, expires_at desc);

alter table public.passkey_challenges enable row level security;
alter table public.passkey_sessions enable row level security;

revoke all on public.passkey_challenges, public.passkey_sessions from public, anon, authenticated;

drop policy if exists passkey_challenges_service_role_access on public.passkey_challenges;
create policy passkey_challenges_service_role_access
on public.passkey_challenges
for all
to service_role
using (true)
with check (true);

drop policy if exists passkey_sessions_service_role_access on public.passkey_sessions;
create policy passkey_sessions_service_role_access
on public.passkey_sessions
for all
to service_role
using (true)
with check (true);

grant select, insert, update, delete on public.passkey_challenges, public.passkey_sessions to service_role;
