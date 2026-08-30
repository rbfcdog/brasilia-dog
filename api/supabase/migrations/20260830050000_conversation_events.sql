create table public.conversation_events (
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

create index conversation_events_conversation_created_idx
  on public.conversation_events (conversation_id, created_at asc, id asc);

alter table public.conversation_events enable row level security;

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
    select 1 from public.conversations
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

revoke all on function public.append_conversation_event from public, anon, authenticated;
grant execute on function public.append_conversation_event to service_role;
