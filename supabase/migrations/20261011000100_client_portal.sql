-- Client Portal data (documents, checklist, e-signature, billing, tax years, contact details).
-- Same model as client_profiles: tables are locked down, an ACTIVE client with a LIVE session may only READ
-- its own rows (RLS), and every client write goes through a narrow SECURITY DEFINER function below.
begin;

create function private.client_is_active_live()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  return private.client_session_is_live() and exists (
    select 1 from public.client_profiles as profile
    where profile.user_id = auth.uid() and profile.status = 'active'
  );
end;
$function$;
alter function private.client_is_active_live() owner to postgres;
revoke all on function private.client_is_active_live() from public, anon, authenticated, service_role;
grant execute on function private.client_is_active_live() to authenticated;

create function private.require_client()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not private.client_is_active_live() then
    raise exception 'Please log in again.' using errcode = '42501';
  end if;
  return auth.uid();
end;
$function$;
alter function private.require_client() owner to postgres;
revoke all on function private.require_client() from public, anon, authenticated, service_role;
grant execute on function private.require_client() to authenticated;

/* ------------------------------------------------------------------ tables */
create table public.client_contact_details (
  user_id uuid primary key references public.client_profiles(user_id) on delete cascade,
  phone text not null default '' check (char_length(phone) <= 40 and phone !~ '[[:cntrl:]]'),
  company text not null default '' check (char_length(company) <= 100 and company !~ '[[:cntrl:]]'),
  country text not null default '' check (char_length(country) <= 60 and country !~ '[[:cntrl:]]'),
  address text not null default '' check (char_length(address) <= 200 and address !~ '[[:cntrl:]]'),
  city text not null default '' check (char_length(city) <= 80 and city !~ '[[:cntrl:]]'),
  updated_at timestamptz not null default now()
);

create table public.client_tax_years (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.client_profiles(user_id) on delete cascade,
  tax_year integer not null check (tax_year between 2000 and 2100),
  stage text not null default 'Collecting documents'
    check (stage in ('Collecting documents', 'Preparing return', 'Awaiting your review', 'Filed', 'Completed')),
  note text not null default '' check (char_length(note) <= 300),
  filed_at date,
  updated_at timestamptz not null default now(),
  unique (user_id, tax_year)
);

create table public.client_checklist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.client_profiles(user_id) on delete cascade,
  key text check (key is null or key ~ '^(upload-docs|sign:[a-z0-9-]{1,60})$'),
  label text not null check (char_length(label) between 3 and 200),
  status text not null default 'Pending' check (status in ('Pending', 'Needs Action', 'Completed')),
  tax_year integer not null check (tax_year between 2000 and 2100),
  sort integer not null default 0,
  updated_at timestamptz not null default now()
);

create table public.client_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.client_profiles(user_id) on delete cascade,
  storage_path text not null unique check (storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.[a-z0-9]{2,5}$'),
  file_name text not null check (char_length(file_name) between 1 and 120),
  mime text not null check (mime in ('application/pdf', 'image/jpeg', 'image/png', 'text/csv', 'application/vnd.ms-excel',
    'application/msword', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  size_bytes integer not null check (size_bytes between 1 and 26214400),
  tag text not null check (tag in ('W-2', '1099', 'Salary Certificate', 'Bank Statement', 'Expense Receipt', 'Wealth Statement', 'ID / CNIC', 'Other')),
  tax_year integer not null check (tax_year between 2000 and 2100),
  status text not null default 'Received' check (status in ('Received', 'Reviewed', 'Needs Attention')),
  admin_note text not null default '' check (char_length(admin_note) <= 300),
  uploaded_at timestamptz not null default now()
);

create table public.client_esign_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.client_profiles(user_id) on delete cascade,
  doc_key text not null check (doc_key ~ '^[a-z0-9-]{1,60}$'),
  title text not null check (char_length(title) between 3 and 120),
  body text not null default '' check (char_length(body) <= 20000),
  tax_year integer check (tax_year between 2000 and 2100),
  status text not null default 'Pending' check (status in ('Pending', 'Signed')),
  created_at timestamptz not null default now(),
  signed_at timestamptz,
  signed_name text check (char_length(signed_name) <= 120),
  signed_ip text check (char_length(signed_ip) <= 64),
  signed_user_agent text check (char_length(signed_user_agent) <= 200),
  unique (user_id, doc_key),
  check ((status = 'Signed') = (signed_at is not null))
);

create sequence public.client_invoice_number_seq;

create table public.client_invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.client_profiles(user_id) on delete cascade,
  number text not null unique,
  description text not null check (char_length(description) between 3 and 200),
  tax_year integer check (tax_year between 2000 and 2100),
  amount_minor bigint not null check (amount_minor > 0 and amount_minor <= 10000000000),
  currency text not null default 'PKR' check (currency in ('PKR', 'USD', 'GBP', 'AED')),
  status text not null default 'Open' check (status in ('Open', 'Paid', 'Void')),
  issued_at timestamptz not null default now(),
  due_at date,
  paid_at timestamptz
);

create table public.client_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.client_profiles(user_id) on delete cascade,
  invoice_id uuid not null references public.client_invoices(id) on delete cascade,
  amount_minor bigint not null check (amount_minor > 0 and amount_minor <= 10000000000),
  method text not null check (method in ('Bank transfer', 'JazzCash', 'Easypaisa', 'Cash at office', 'Other')),
  reference text not null check (char_length(reference) between 3 and 120),
  note text not null default '' check (char_length(note) <= 300),
  status text not null default 'Pending Review' check (status in ('Pending Review', 'Confirmed', 'Rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index client_tax_years_user_idx on public.client_tax_years (user_id);
create index client_checklist_user_idx on public.client_checklist_items (user_id);
create index client_documents_user_idx on public.client_documents (user_id);
create index client_esign_user_idx on public.client_esign_requests (user_id);
create index client_invoices_user_idx on public.client_invoices (user_id);
create index client_payments_user_idx on public.client_payments (user_id);
create index client_payments_invoice_idx on public.client_payments (invoice_id);

/* ------------------------------------------------- lock down + read-only RLS */
do $policies$
declare
  portal_table text;
begin
  foreach portal_table in array array['client_contact_details', 'client_tax_years', 'client_checklist_items',
    'client_documents', 'client_esign_requests', 'client_invoices', 'client_payments']
  loop
    execute format('alter table public.%I owner to postgres', portal_table);
    execute format('alter table public.%I enable row level security', portal_table);
    execute format('revoke all on table public.%I from public, anon, authenticated, service_role', portal_table);
    execute format('grant select on table public.%I to authenticated', portal_table);
    execute format($p$create policy %I on public.%I for select to authenticated
      using (user_id = (select auth.uid()) and (select private.client_is_active_live()))$p$,
      portal_table || '_owner_active_live_session', portal_table);
  end loop;
end
$policies$;
alter sequence public.client_invoice_number_seq owner to postgres;
revoke all on sequence public.client_invoice_number_seq from public, anon, authenticated, service_role;

/* ------------------------------------------------ client write functions */
-- Error codes are part of the contract with the Next.js API:
--   42501 not signed in / not active   22023 invalid input (message is user-facing)
--   P0002 not found                    55000 not allowed in current state
--   54000 too many                     23505 duplicate

create function public.portal_bootstrap()
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  me uuid := private.require_client();
  inserted integer;
  this_year integer := extract(year from now())::integer;
begin
  insert into public.client_contact_details (user_id) values (me) on conflict do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then return; end if;

  insert into public.client_tax_years (user_id, tax_year) values (me, this_year) on conflict do nothing;
  insert into public.client_checklist_items (user_id, key, label, status, tax_year, sort) values
    (me, 'upload-docs', 'Upload your tax documents (salary certificate, W-2, bank statements, etc.)', 'Pending', this_year, 0),
    (me, 'sign:engagement-letter', 'Review & sign the engagement letter', 'Needs Action', this_year, 1),
    (me, 'sign:draft-return', 'Review your draft return & e-sign (available once we share it)', 'Pending', this_year, 2);
  insert into public.client_esign_requests (user_id, doc_key, title, body, tax_year) values
    (me, 'engagement-letter', 'Engagement letter', $letter$This engagement letter confirms that TaxTrax Consulting ("we") will prepare and, where agreed, file your tax return(s) based on the information and documents you provide.

Your responsibilities: provide complete and accurate information, respond to our questions promptly, and review the draft return before filing.
Our responsibilities: prepare your return in line with the applicable tax laws, keep your information confidential, and tell you about anything that affects your filing.
Fees: as quoted to you and shown under Billing & Payments in your portal.

By typing your full name and signing below you confirm that you have read and agree to these terms.$letter$, this_year)
    on conflict do nothing;
end;
$function$;

create function public.portal_save_profile(p_phone text, p_company text, p_country text, p_address text, p_city text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  me uuid := private.require_client();
  phone_digits integer := char_length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'));
begin
  if coalesce(btrim(p_phone), '') <> '' and (btrim(p_phone) !~ '^[+0-9][0-9 ().-]*$' or phone_digits not between 7 and 15) then
    raise exception 'Enter a valid phone number, e.g. +92 300 1234567.' using errcode = '22023';
  end if;
  insert into public.client_contact_details (user_id, phone, company, country, address, city)
  values (me, btrim(coalesce(p_phone, '')), btrim(coalesce(p_company, '')), btrim(coalesce(p_country, '')),
    btrim(coalesce(p_address, '')), btrim(coalesce(p_city, '')))
  on conflict (user_id) do update set phone = excluded.phone, company = excluded.company, country = excluded.country,
    address = excluded.address, city = excluded.city, updated_at = now();
exception when check_violation then
  raise exception 'One of the fields is too long or contains invalid characters.' using errcode = '22023';
end;
$function$;

create function public.portal_add_document(p_path text, p_name text, p_mime text, p_size integer, p_tag text, p_year integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  me uuid := private.require_client();
  new_id uuid;
begin
  if p_path is null or split_part(p_path, '/', 1) <> me::text then
    raise exception 'Invalid upload.' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects as object where object.bucket_id = 'client-documents' and object.name = p_path) then
    raise exception 'The uploaded file was not found. Please try again.' using errcode = 'P0002';
  end if;
  if (select count(*) from public.client_documents where user_id = me) >= 200 then
    raise exception 'You have reached the document limit. Please contact us.' using errcode = '54000';
  end if;
  insert into public.client_documents (user_id, storage_path, file_name, mime, size_bytes, tag, tax_year)
  values (me, p_path, p_name, p_mime, p_size, p_tag, p_year) returning id into new_id;
  update public.client_checklist_items set status = 'Completed', updated_at = now()
  where user_id = me and key = 'upload-docs' and tax_year = p_year and status <> 'Completed';
  return new_id;
exception when check_violation then
  raise exception 'That file type, size or document type is not allowed.' using errcode = '22023';
end;
$function$;

create function public.portal_delete_document(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  me uuid := private.require_client();
  doc public.client_documents%rowtype;
begin
  select * into doc from public.client_documents where id = p_id and user_id = me for update;
  if not found then raise exception 'Document not found.' using errcode = 'P0002'; end if;
  if doc.status <> 'Received' then
    raise exception 'This document has already been reviewed, so it can''t be removed. Contact us if it needs replacing.' using errcode = '55000';
  end if;
  delete from public.client_documents where id = doc.id;
  if not exists (select 1 from public.client_documents where user_id = me and tax_year = doc.tax_year) then
    update public.client_checklist_items set status = 'Pending', updated_at = now()
    where user_id = me and key = 'upload-docs' and tax_year = doc.tax_year and status = 'Completed';
  end if;
  return doc.storage_path;
end;
$function$;

create function public.portal_set_checklist(p_id uuid, p_done boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  me uuid := private.require_client();
  item public.client_checklist_items%rowtype;
begin
  if p_done is null then raise exception 'Invalid request.' using errcode = '22023'; end if;
  select * into item from public.client_checklist_items where id = p_id and user_id = me for update;
  if not found then raise exception 'Task not found.' using errcode = 'P0002'; end if;
  if item.key is not null then
    raise exception 'This task completes automatically when you finish the step.' using errcode = '55000';
  end if;
  update public.client_checklist_items set status = case when p_done then 'Completed' else 'Pending' end, updated_at = now()
  where id = item.id;
end;
$function$;

create function public.portal_sign(p_id uuid, p_typed_name text, p_agree boolean, p_ip text, p_user_agent text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  me uuid := private.require_client();
  request_row public.client_esign_requests%rowtype;
  account_name text;
  typed text := btrim(coalesce(p_typed_name, ''));
begin
  if p_agree is distinct from true then raise exception 'Please tick the box to confirm you agree.' using errcode = '22023'; end if;
  if typed = '' then raise exception 'Type your full name to sign.' using errcode = '22023'; end if;
  select * into request_row from public.client_esign_requests where id = p_id and user_id = me for update;
  if not found then raise exception 'Document not found.' using errcode = 'P0002'; end if;
  if request_row.status = 'Signed' then raise exception 'This document is already signed.' using errcode = '55000'; end if;
  select name into account_name from public.client_profiles where user_id = me;
  if lower(regexp_replace(btrim(normalize(typed, nfkc)), '\s+', ' ', 'g'))
     is distinct from lower(regexp_replace(btrim(normalize(account_name, nfkc)), '\s+', ' ', 'g')) then
    raise exception 'Type your name exactly as it appears on your account: %', account_name using errcode = '22023';
  end if;
  update public.client_esign_requests set status = 'Signed', signed_at = now(), signed_name = left(typed, 120),
    signed_ip = left(coalesce(p_ip, ''), 64), signed_user_agent = left(coalesce(p_user_agent, ''), 200)
  where id = request_row.id;
  update public.client_checklist_items set status = 'Completed', updated_at = now()
  where user_id = me and key = 'sign:' || request_row.doc_key;
end;
$function$;

create function public.portal_report_payment(p_invoice_id uuid, p_amount_minor bigint, p_method text, p_reference text, p_note text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  me uuid := private.require_client();
  invoice_row public.client_invoices%rowtype;
  confirmed bigint;
  ref text := btrim(coalesce(p_reference, ''));
  new_id uuid;
begin
  select * into invoice_row from public.client_invoices where id = p_invoice_id and user_id = me for update;
  if not found then raise exception 'Invoice not found.' using errcode = 'P0002'; end if;
  if invoice_row.status <> 'Open' then
    raise exception '%', case when invoice_row.status = 'Paid' then 'This invoice is already paid.' else 'This invoice is no longer payable.' end using errcode = '55000';
  end if;
  if p_method is null or p_method not in ('Bank transfer', 'JazzCash', 'Easypaisa', 'Cash at office', 'Other') then
    raise exception 'Choose how you paid.' using errcode = '22023';
  end if;
  if char_length(ref) < 3 then raise exception 'Enter the transaction ID / reference so we can match your payment.' using errcode = '22023'; end if;
  if p_amount_minor is null or p_amount_minor <= 0 then raise exception 'Enter the amount you paid.' using errcode = '22023'; end if;
  select coalesce(sum(amount_minor), 0) into confirmed from public.client_payments where invoice_id = invoice_row.id and status = 'Confirmed';
  if p_amount_minor > invoice_row.amount_minor - confirmed then
    raise exception 'That is more than the remaining balance on this invoice.' using errcode = '22023';
  end if;
  if (select count(*) from public.client_payments where invoice_id = invoice_row.id and status = 'Pending Review') >= 5 then
    raise exception 'You already have several payments waiting for review on this invoice.' using errcode = '54000';
  end if;
  if exists (select 1 from public.client_payments where invoice_id = invoice_row.id and lower(reference) = lower(ref) and status <> 'Rejected') then
    raise exception 'A payment with that reference was already submitted.' using errcode = '23505';
  end if;
  insert into public.client_payments (user_id, invoice_id, amount_minor, method, reference, note)
  values (me, invoice_row.id, p_amount_minor, p_method, ref, left(btrim(coalesce(p_note, '')), 300)) returning id into new_id;
  return new_id;
exception when check_violation then
  raise exception 'Those payment details are not valid.' using errcode = '22023';
end;
$function$;

do $grants$
declare
  fn text;
begin
  foreach fn in array array[
    'portal_bootstrap()', 'portal_save_profile(text,text,text,text,text)',
    'portal_add_document(text,text,text,integer,text,integer)', 'portal_delete_document(uuid)',
    'portal_set_checklist(uuid,boolean)', 'portal_sign(uuid,text,boolean,text,text)',
    'portal_report_payment(uuid,bigint,text,text,text)']
  loop
    execute format('alter function public.%s owner to postgres', fn);
    execute format('revoke all on function public.%s from public, anon, authenticated, service_role', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end
$grants$;

commit;
