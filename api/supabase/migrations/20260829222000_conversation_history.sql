create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete restrict,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 16000),
  created_at timestamptz not null default now()
);

create index conversations_owner_updated_idx
  on public.conversations (owner_id, updated_at desc);
create index conversation_messages_conversation_created_idx
  on public.conversation_messages (conversation_id, created_at asc, id asc);

create trigger conversations_set_updated_at
before update on public.conversations
for each row execute function public.set_updated_at();

alter table public.conversations enable row level security;
alter table public.conversation_messages enable row level security;

create or replace function public.append_conversation_message(
  p_conversation_id uuid,
  p_owner_id uuid,
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
    select 1 from public.conversations
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

revoke all on function public.append_conversation_message from public, anon, authenticated;
grant execute on function public.append_conversation_message to service_role;
