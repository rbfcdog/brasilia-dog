drop function if exists public.record_payment_attempt(
  uuid, uuid, uuid, text, text, uuid, text, bigint, text, smallint, text, jsonb, text
);

create or replace function public.record_payment_attempt(
  p_product_id uuid,
  p_offering_id uuid,
  p_endpoint_id uuid,
  p_rail text,
  p_provider_payment_id text,
  p_idempotency_key uuid,
  p_status text,
  p_amount_minor bigint,
  p_currency text,
  p_scale smallint,
  p_request_fingerprint text default null,
  p_agent_execution_proof_id uuid default null,
  p_receipt jsonb default null,
  p_failure_code text default null
)
returns public.payment_attempts
language plpgsql
security definer
set search_path = public
as $$
declare
  attempt public.payment_attempts;
begin
  if p_agent_execution_proof_id is null then
    raise exception 'An agent execution proof is required for payment recording.';
  end if;

  insert into public.payment_attempts (
    product_id,
    offering_id,
    endpoint_id,
    rail,
    provider_payment_id,
    idempotency_key,
    status,
    amount_minor,
    currency,
    scale,
    request_fingerprint,
    agent_execution_proof_id,
    receipt,
    failure_code,
    settled_at
  ) values (
    p_product_id,
    p_offering_id,
    p_endpoint_id,
    p_rail,
    p_provider_payment_id,
    p_idempotency_key,
    p_status,
    p_amount_minor,
    p_currency,
    p_scale,
    p_request_fingerprint,
    p_agent_execution_proof_id,
    p_receipt,
    p_failure_code,
    case when p_status = 'settled' then now() else null end
  )
  on conflict (offering_id, idempotency_key) do nothing
  returning * into attempt;

  if attempt.id is null then
    select * into attempt
    from public.payment_attempts
    where offering_id = p_offering_id
      and idempotency_key = p_idempotency_key;
    return attempt;
  end if;

  insert into public.audit_events (
    actor_type,
    event_type,
    product_id,
    offering_id,
    endpoint_id,
    payment_attempt_id,
    metadata
  ) values (
    'service',
    'payment_attempt_recorded',
    attempt.product_id,
    attempt.offering_id,
    attempt.endpoint_id,
    attempt.id,
    jsonb_build_object(
      'rail', attempt.rail,
      'status', attempt.status,
      'agent_execution_proof_id', attempt.agent_execution_proof_id
    )
  );

  return attempt;
end;
$$;

revoke all on function public.record_payment_attempt from public, anon, authenticated;
grant execute on function public.record_payment_attempt to service_role;
