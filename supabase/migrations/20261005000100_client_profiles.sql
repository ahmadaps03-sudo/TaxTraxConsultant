begin;

create table public.client_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  constraint client_profiles_name_trimmed check (
    name = btrim(name, E' \t\n\r\f\v' || U&'\0085\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')
  ),
  constraint client_profiles_name_length check (char_length(name) between 1 and 100),
  constraint client_profiles_name_no_controls check (name !~ '[[:cntrl:]]'),
  constraint client_profiles_status check (status in ('pending', 'active', 'suspended'))
);

alter table public.client_profiles owner to postgres;
alter table public.client_profiles enable row level security;

revoke all on table public.client_profiles from public, anon, authenticated, service_role;
grant select on table public.client_profiles to authenticated;
grant select, insert, update, delete on table public.client_profiles to service_role;

commit;
