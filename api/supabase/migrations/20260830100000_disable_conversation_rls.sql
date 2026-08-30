-- Conversation persistence is exclusively mediated by the server-side API.
-- Disable RLS here so a deployment with a non-service Supabase database role
-- cannot reject valid authenticated chat turns.
alter table public.conversation_events disable row level security;
alter table public.conversation_messages disable row level security;
alter table public.conversations disable row level security;

grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on public.conversations to anon, authenticated, service_role;
grant select, insert, update, delete on public.conversation_messages to anon, authenticated, service_role;
grant select, insert, update, delete on public.conversation_events to anon, authenticated, service_role;
