-- The Node API is the sole conversation authority. Browser clients do not access
-- these tables directly. Permit only the Supabase service_role to use the
-- server-side persistence tables while RLS remains enabled.

alter table public.conversations enable row level security;
alter table public.conversation_messages enable row level security;
alter table public.conversation_events enable row level security;

drop policy if exists conversations_service_role_access on public.conversations;
create policy conversations_service_role_access
on public.conversations
for all
to service_role
using (true)
with check (true);

drop policy if exists conversation_messages_service_role_access on public.conversation_messages;
create policy conversation_messages_service_role_access
on public.conversation_messages
for all
to service_role
using (true)
with check (true);

drop policy if exists conversation_events_service_role_access on public.conversation_events;
create policy conversation_events_service_role_access
on public.conversation_events
for all
to service_role
using (true)
with check (true);

grant select, insert, update on public.conversations to service_role;
grant select, insert on public.conversation_messages to service_role;
grant select, insert on public.conversation_events to service_role;
