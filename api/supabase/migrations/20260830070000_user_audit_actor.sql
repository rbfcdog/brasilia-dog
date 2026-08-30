alter table public.audit_events
  drop constraint audit_events_actor_type_check;

alter table public.audit_events
  add constraint audit_events_actor_type_check
  check (actor_type in ('system', 'service', 'operator', 'user'));
