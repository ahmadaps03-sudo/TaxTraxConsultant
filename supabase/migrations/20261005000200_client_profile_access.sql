begin;

create schema private authorization postgres;
revoke all on schema private from public, anon, authenticated, service_role;
grant usage on schema private to authenticated;
alter default privileges for role postgres in schema private revoke execute on functions from public;

create function private.client_session_is_live()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  session_identity text := auth.jwt() ->> 'session_id';
  user_identity uuid := auth.uid();
begin
  if user_identity is null or session_identity is null
    or session_identity !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then
    return false;
  end if;

  return exists (
    select 1
    from auth.sessions as provider_session
    where provider_session.id = session_identity::uuid
      and provider_session.user_id = user_identity
  );
end;
$function$;

alter function private.client_session_is_live() owner to postgres;
revoke all on function private.client_session_is_live() from public, anon, authenticated, service_role;
grant execute on function private.client_session_is_live() to authenticated;

create policy client_profiles_owner_active_live_session
on public.client_profiles
for select
to authenticated
using (
  user_id = (select auth.uid())
  and status = 'active'
  and (select private.client_session_is_live())
);

commit;
