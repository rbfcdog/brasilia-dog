-- Reconciles durable conversation persistence for deployments that predate
-- conversation history, text owner IDs, or immutable event recording.
-- Application access remains server-side through the Supabase service-role key.

create extension if not exists pgcrypto;

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

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.conversations
  drop constraint if exists conversations_owner_id_fkey;

alter table public.conversations
  alter column owner_id type text using owner_id::text,
  alter column owner_id set not null,
  alter column created_at set default now(),
  alter column updated_at set default now();

create table if not exists public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete restrict,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 16000),
  created_at timestamptz not null default now()
);

create table if not exists public.conversation_events (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete restrict,
  type text not null check (type in (
    'catalog_search',
    'category_list',
    'product_comparison',
    'agent_response',
    'mandate_proposed',
    'passkey_approved',
    'mandate_activated',
    'payment_executed',
    'payment_failed'
  )),
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists conversations_owner_updated_idx
  on public.conversations (owner_id, updated_at desc);
create index if not exists conversation_messages_conversation_created_idx
  on public.conversation_messages (conversation_id, created_at asc, id asc);
create index if not exists conversation_events_conversation_created_idx
  on public.conversation_events (conversation_id, created_at asc, id asc);

alter table public.conversations enable row level security;
alter table public.conversation_messages enable row level security;
alter table public.conversation_events enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'conversations_set_updated_at'
      and tgrelid = 'public.conversations'::regclass
      and not tgisinternal
  ) then
    create trigger conversations_set_updated_at
    before update on public.conversations
    for each row execute function public.set_updated_at();
  end if;
end;
$$;

create or replace function public.append_conversation_message(
  p_conversation_id uuid,
  p_owner_id text,
  p_role text,
  p_content text,
  p_created_at timestamptz
)
returns public.conversation_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  message public.conversation_messages;
begin
  if not exists (
    select 1
    from public.conversations
    where id = p_conversation_id and owner_id = p_owner_id
  ) then
    raise exception 'Conversation not found.';
  end if;

  insert into public.conversation_messages (
    conversation_id,
    role,
    content,
    created_at
  ) values (
    p_conversation_id,
    p_role,
    p_content,
    p_created_at
  )
  returning * into message;

  update public.conversations
  set updated_at = greatest(updated_at, message.created_at)
  where id = p_conversation_id;

  return message;
end;
$$;

create or replace function public.append_conversation_event(
  p_conversation_id uuid,
  p_owner_id text,
  p_type text,
  p_payload jsonb,
  p_created_at timestamptz
)
returns public.conversation_events
language plpgsql
security definer
set search_path = public
as $$
declare
  event public.conversation_events;
begin
  if not exists (
    select 1
    from public.conversations
    where id = p_conversation_id and owner_id = p_owner_id
  ) then
    raise exception 'Conversation not found.';
  end if;

  insert into public.conversation_events (
    conversation_id,
    type,
    payload,
    created_at
  ) values (
    p_conversation_id,
    p_type,
    p_payload,
    p_created_at
  )
  returning * into event;

  update public.conversations
  set updated_at = greatest(updated_at, event.created_at)
  where id = p_conversation_id;

  return event;
end;
$$;

grant usage on schema public to service_role;
grant select, insert, update on public.conversations to service_role;
grant select, insert on public.conversation_messages to service_role;
grant select, insert on public.conversation_events to service_role;
revoke all on function public.append_conversation_message(uuid, text, text, text, timestamptz)
from public, anon, authenticated;
revoke all on function public.append_conversation_event(uuid, text, text, jsonb, timestamptz)
from public, anon, authenticated;
grant execute on function public.append_conversation_message(uuid, text, text, text, timestamptz)
to service_role;
grant execute on function public.append_conversation_event(uuid, text, text, jsonb, timestamptz)
to service_role;
