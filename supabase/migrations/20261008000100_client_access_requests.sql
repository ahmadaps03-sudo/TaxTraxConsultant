begin;

create table public.client_access_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  phone text not null,
  company text,
  contact_consent boolean not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  constraint access_request_name check (name = btrim(name) and char_length(name) between 2 and 100 and name !~ '[[:cntrl:]]'),
  constraint access_request_email check (email = lower(btrim(email)) and char_length(email) between 3 and 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' and email !~ '[[:cntrl:]]'),
  constraint access_request_phone check (phone = btrim(phone) and char_length(phone) between 7 and 40 and phone ~ '^[+0-9][0-9 ().-]*$' and char_length(regexp_replace(phone, '[^0-9]', '', 'g')) between 7 and 15),
  constraint access_request_company check (company is null or (company = btrim(company) and char_length(company) between 1 and 100 and company !~ '[[:cntrl:]]')),
  constraint access_request_consent check (contact_consent = true),
  constraint access_request_pending check (status = 'pending')
);

alter table public.client_access_requests owner to postgres;
alter table public.client_access_requests enable row level security;
revoke all on public.client_access_requests from public, anon, authenticated, service_role;

create function public.submit_client_access_request(
  p_name text, p_email text, p_phone text, p_company text, p_contact_consent boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.client_access_requests (name, email, phone, company, contact_consent)
  values (p_name, p_email, p_phone, p_company, p_contact_consent)
  on conflict (email) do nothing;
end;
$function$;

alter function public.submit_client_access_request(text, text, text, text, boolean) owner to postgres;
revoke all on function public.submit_client_access_request(text, text, text, text, boolean) from public, anon, authenticated, service_role;
grant execute on function public.submit_client_access_request(text, text, text, text, boolean) to service_role;

commit;
