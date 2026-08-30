-- Reconcile Node API access to persisted conversations when a project has RLS
-- enabled but was provisioned before the service-role policies existed.
-- Browser clients remain denied: only the server-side service_role may access
-- these tables through PostgREST.

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

grant usage on schema public to service_role;
grant select, insert, update on public.conversations to service_role;
grant select, insert on public.conversation_messages to service_role;
grant select, insert on public.conversation_events to service_role;
