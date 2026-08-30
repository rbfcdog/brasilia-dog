-- Passkey identities are application-level strings and are not Supabase Auth UUIDs.
-- Preserve owner scoping while removing the incorrect auth.users coupling.

drop function if exists public.append_conversation_message(uuid, uuid, text, text, timestamptz);

alter table public.conversations
  drop constraint if exists conversations_owner_id_fkey;

alter table public.conversations
  alter column owner_id type text using owner_id::text;

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

revoke all on function public.append_conversation_message(uuid, text, text, text, timestamptz)
from public, anon, authenticated;
grant execute on function public.append_conversation_message(uuid, text, text, text, timestamptz)
to service_role;
