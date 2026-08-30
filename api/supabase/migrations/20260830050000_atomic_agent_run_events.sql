create or replace function public.append_agent_run_event(
  p_run_id uuid,
  p_type text,
  p_data jsonb default '{}'::jsonb
)
returns public.agent_run_events
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event public.agent_run_events;
begin
  if p_type is null or char_length(p_type) not between 1 and 80 then
    raise exception 'invalid agent run event type' using errcode = '22023';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'invalid agent run event data' using errcode = '22023';
  end if;

  perform 1 from public.agent_runs where id = p_run_id for update;
  if not found then
    raise exception 'agent run not found' using errcode = 'P0002';
  end if;

  insert into public.agent_run_events (run_id, sequence, type, data)
  select p_run_id, coalesce(max(sequence), 0) + 1, p_type, p_data
  from public.agent_run_events
  where run_id = p_run_id
  returning * into v_event;

  return v_event;
end;
$$;

revoke all on function public.append_agent_run_event(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.append_agent_run_event(uuid, text, jsonb) to service_role;
