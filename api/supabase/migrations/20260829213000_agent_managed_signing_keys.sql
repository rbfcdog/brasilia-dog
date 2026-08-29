-- Agent private keys remain outside this API. This migration permits the public
-- verification key to be registered as externally agent-managed rather than
-- falsely asserting server KMS custody.
alter table public.agent_signing_keys
  drop constraint agent_signing_keys_custody_check;

alter table public.agent_signing_keys
  add constraint agent_signing_keys_custody_check
  check (custody in ('server_kms', 'agent_managed'));
