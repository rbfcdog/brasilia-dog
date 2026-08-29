-- Passkey (WebAuthn) credential storage.
-- Stores public keys, credential IDs, counters, and transports
-- so the Node backend can verify registration and authentication assertions.
-- Service-role only: the API is the authority for credential writes.

create table if not exists public.passkey_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  credential_id text not null unique,
  public_key bytea not null,
  counter bigint not null default 0,
  transports text[] not null default '{}'::text[],
  device_type text,
  backed_up boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists passkey_credentials_user_idx
  on public.passkey_credentials (user_id);

create trigger passkey_credentials_set_updated_at
before update on public.passkey_credentials
for each row execute function public.set_updated_at();

alter table public.passkey_credentials enable row level security;

create policy "Users read their own passkey credentials"
on public.passkey_credentials for select
to authenticated
using (user_id = auth.uid());

revoke all on public.passkey_credentials from anon, authenticated;
grant select on public.passkey_credentials to authenticated;
grant all on public.passkey_credentials to service_role;
