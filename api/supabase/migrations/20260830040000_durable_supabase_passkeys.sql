-- Persist WebAuthn challenges and passkey sessions across API restarts.
-- All writes remain service-role only; users may read only their credential metadata.

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
grant all on public.passkey_challenges, public.passkey_sessions to service_role;
