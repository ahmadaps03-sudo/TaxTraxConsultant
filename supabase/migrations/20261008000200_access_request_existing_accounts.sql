begin;

create or replace function public.submit_client_access_request(
  p_name text, p_email text, p_phone text, p_company text, p_contact_consent boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.client_access_requests (name, email, phone, company, contact_consent)
  select p_name, p_email, p_phone, p_company, p_contact_consent
  where not exists (
    select 1 from auth.users
    where lower(btrim(email)) = lower(btrim(p_email))
  )
  on conflict (email) do nothing;
end;
$function$;

alter function public.submit_client_access_request(text, text, text, text, boolean) owner to postgres;
revoke all on function public.submit_client_access_request(text, text, text, text, boolean) from public, anon, authenticated, service_role;
grant execute on function public.submit_client_access_request(text, text, text, text, boolean) to service_role;

commit;
