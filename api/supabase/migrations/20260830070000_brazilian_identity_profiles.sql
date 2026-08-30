create table public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  cpf char(11) not null unique check (cpf ~ '^[0-9]{11}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.merchant_profiles
  add column cnpj char(14) unique check (cnpj is null or cnpj ~ '^[0-9]{14}$');

create trigger user_profiles_set_updated_at before update on public.user_profiles
for each row execute function public.set_updated_at();

create or replace function public.handle_new_merchant_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  account_type text := coalesce(new.raw_user_meta_data ->> 'account_type', 'buyer');
  cpf_value text := regexp_replace(coalesce(new.raw_user_meta_data ->> 'cpf', ''), '\D', '', 'g');
  cnpj_value text := regexp_replace(coalesce(new.raw_user_meta_data ->> 'cnpj', ''), '\D', '', 'g');
begin
  if cpf_value ~ '^[0-9]{11}$' then
    insert into public.user_profiles (user_id, cpf)
    values (new.id, cpf_value)
    on conflict (user_id) do nothing;
  end if;

  if account_type = 'merchant' then
    insert into public.merchant_profiles (user_id, business_name, cnpj)
    values (
      new.id,
      coalesce(nullif(trim(new.raw_user_meta_data ->> 'business_name'), ''), split_part(new.email, '@', 1), 'Merchant'),
      nullif(cnpj_value, '')
    )
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;

alter table public.user_profiles enable row level security;
create policy "Users read their own profile"
on public.user_profiles for select to authenticated
using (user_id = auth.uid());

grant select on public.user_profiles to authenticated;
