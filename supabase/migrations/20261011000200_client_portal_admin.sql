-- Staff side of the Client Portal. Executable ONLY by service_role (i.e. the portal-admin Edge Function, which in turn
-- is only reachable with the private ADMIN_PORTAL_SECRET). Business problems are returned as a code, not raised:
--   {code:'ok', data} | {code:'invalid', message} | {code:'not_found'} | {code:'conflict', message}
begin;

create function private.refresh_invoice(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  invoice_row public.client_invoices%rowtype;
  paid bigint;
begin
  select * into invoice_row from public.client_invoices where id = p_invoice_id for update;
  if not found or invoice_row.status = 'Void' then return; end if;
  select coalesce(sum(amount_minor), 0) into paid from public.client_payments where invoice_id = p_invoice_id and status = 'Confirmed';
  if paid >= invoice_row.amount_minor then
    update public.client_invoices set status = 'Paid', paid_at = coalesce(paid_at, now()) where id = p_invoice_id;
  else
    update public.client_invoices set status = 'Open', paid_at = null where id = p_invoice_id;
  end if;
end;
$function$;
alter function private.refresh_invoice(uuid) owner to postgres;
revoke all on function private.refresh_invoice(uuid) from public, anon, authenticated, service_role;

create function public.admin_portal(p_action text, p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  payload jsonb := coalesce(p_payload, '{}'::jsonb);
  target_user uuid;
  target_id uuid;
  amount bigint;
  new_id uuid;
  new_number text;
  currency_in text;
  existing_currency text;
  affected integer;
  decision text;
  payment_row public.client_payments%rowtype;
  invoice_row public.client_invoices%rowtype;
  doc_key_in text;
  result jsonb;
begin
  if jsonb_typeof(payload) <> 'object' then return jsonb_build_object('code', 'invalid', 'message', 'Invalid request.'); end if;

  if p_action = 'snapshot' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', profile.user_id, 'name', profile.name, 'status', profile.status, 'email', identity.email, 'createdAt', profile.created_at,
      'contact', (select to_jsonb(contact) - 'user_id' from public.client_contact_details contact where contact.user_id = profile.user_id),
      'taxYears', coalesce((select jsonb_agg(to_jsonb(item) - 'user_id' order by item.tax_year desc) from public.client_tax_years item where item.user_id = profile.user_id), '[]'::jsonb),
      'checklist', coalesce((select jsonb_agg(to_jsonb(item) - 'user_id' order by item.tax_year desc, item.sort, item.updated_at) from public.client_checklist_items item where item.user_id = profile.user_id), '[]'::jsonb),
      'documents', coalesce((select jsonb_agg(to_jsonb(item) - 'user_id' - 'storage_path' order by item.uploaded_at desc) from public.client_documents item where item.user_id = profile.user_id), '[]'::jsonb),
      'esign', coalesce((select jsonb_agg(to_jsonb(item) - 'user_id' - 'body' order by item.created_at desc) from public.client_esign_requests item where item.user_id = profile.user_id), '[]'::jsonb),
      'invoices', coalesce((select jsonb_agg(to_jsonb(item) - 'user_id' order by item.issued_at desc) from public.client_invoices item where item.user_id = profile.user_id), '[]'::jsonb),
      'payments', coalesce((select jsonb_agg(to_jsonb(item) - 'user_id' order by item.created_at desc) from public.client_payments item where item.user_id = profile.user_id), '[]'::jsonb)
    ) order by profile.created_at desc), '[]'::jsonb)
    into result
    from public.client_profiles profile
    join auth.users identity on identity.id = profile.user_id
    where profile.status in ('active', 'suspended');
    return jsonb_build_object('code', 'ok', 'data', result);
  end if;

  if p_action = 'add_invoice' then
    target_user := (payload ->> 'userId')::uuid;
    if not exists (select 1 from public.client_profiles where user_id = target_user and status = 'active') then
      return jsonb_build_object('code', 'not_found'); end if;
    currency_in := coalesce(nullif(payload ->> 'currency', ''), 'PKR');
    select currency into existing_currency from public.client_invoices where user_id = target_user and status <> 'Void' and currency <> currency_in limit 1;
    if existing_currency is not null then
      return jsonb_build_object('code', 'conflict', 'message', 'This client is already billed in ' || existing_currency || '. Use one currency per client so balances add up.');
    end if;
    new_number := 'INV-' || extract(year from now())::integer || '-' || lpad(nextval('public.client_invoice_number_seq')::text, 4, '0');
    insert into public.client_invoices (user_id, number, description, tax_year, amount_minor, currency, due_at)
    values (target_user, new_number, btrim(payload ->> 'description'), nullif(payload ->> 'taxYear', '')::integer,
      (payload ->> 'amountMinor')::bigint, currency_in, nullif(payload ->> 'dueAt', '')::date) returning id into new_id;
    return jsonb_build_object('code', 'ok', 'data', jsonb_build_object('id', new_id, 'number', new_number));

  elsif p_action = 'void_invoice' then
    update public.client_invoices set status = 'Void' where id = (payload ->> 'id')::uuid and status <> 'Paid';
    get diagnostics affected = row_count;
    if affected = 0 then return jsonb_build_object('code', 'conflict', 'message', 'Only unpaid invoices can be voided.'); end if;
    return jsonb_build_object('code', 'ok', 'data', '{}'::jsonb);

  elsif p_action = 'review_payment' then
    decision := payload ->> 'decision';
    if decision not in ('Confirmed', 'Rejected') then return jsonb_build_object('code', 'invalid', 'message', 'Invalid decision.'); end if;
    select * into payment_row from public.client_payments where id = (payload ->> 'id')::uuid for update;
    if not found then return jsonb_build_object('code', 'not_found'); end if;
    update public.client_payments set status = decision, reviewed_at = now() where id = payment_row.id;
    perform private.refresh_invoice(payment_row.invoice_id);
    return jsonb_build_object('code', 'ok', 'data', '{}'::jsonb);

  elsif p_action = 'record_payment' then
    select * into invoice_row from public.client_invoices where id = (payload ->> 'invoiceId')::uuid for update;
    if not found or invoice_row.status = 'Void' then return jsonb_build_object('code', 'not_found'); end if;
    insert into public.client_payments (user_id, invoice_id, amount_minor, method, reference, status, reviewed_at)
    values (invoice_row.user_id, invoice_row.id, (payload ->> 'amountMinor')::bigint, coalesce(nullif(payload ->> 'method', ''), 'Cash at office'),
      coalesce(nullif(btrim(payload ->> 'reference'), ''), 'Recorded by staff'), 'Confirmed', now()) returning id into new_id;
    perform private.refresh_invoice(invoice_row.id);
    return jsonb_build_object('code', 'ok', 'data', jsonb_build_object('id', new_id));

  elsif p_action = 'add_checklist' then
    target_user := (payload ->> 'userId')::uuid;
    if not exists (select 1 from public.client_profiles where user_id = target_user and status = 'active') then
      return jsonb_build_object('code', 'not_found'); end if;
    insert into public.client_checklist_items (user_id, label, status, tax_year, sort)
    values (target_user, btrim(payload ->> 'label'), coalesce(nullif(payload ->> 'status', ''), 'Needs Action'),
      coalesce(nullif(payload ->> 'taxYear', '')::integer, extract(year from now())::integer),
      coalesce((select max(sort) + 1 from public.client_checklist_items where user_id = target_user), 0)) returning id into new_id;
    return jsonb_build_object('code', 'ok', 'data', jsonb_build_object('id', new_id));

  elsif p_action = 'set_checklist' then
    update public.client_checklist_items set status = payload ->> 'status', updated_at = now() where id = (payload ->> 'id')::uuid;
    get diagnostics affected = row_count;
    if affected = 0 then return jsonb_build_object('code', 'not_found'); end if;
    return jsonb_build_object('code', 'ok', 'data', '{}'::jsonb);

  elsif p_action = 'remove_checklist' then
    delete from public.client_checklist_items where id = (payload ->> 'id')::uuid;
    get diagnostics affected = row_count;
    if affected = 0 then return jsonb_build_object('code', 'not_found'); end if;
    return jsonb_build_object('code', 'ok', 'data', '{}'::jsonb);

  elsif p_action = 'add_esign' then
    target_user := (payload ->> 'userId')::uuid;
    if not exists (select 1 from public.client_profiles where user_id = target_user and status = 'active') then
      return jsonb_build_object('code', 'not_found'); end if;
    doc_key_in := regexp_replace(regexp_replace(lower(coalesce(nullif(btrim(payload ->> 'docKey'), ''), 'doc-' || substr(gen_random_uuid()::text, 1, 8))), '[^a-z0-9-]+', '-', 'g'), '^-+|-+$', '', 'g');
    if exists (select 1 from public.client_esign_requests where user_id = target_user and doc_key = doc_key_in) then
      return jsonb_build_object('code', 'conflict', 'message', 'A document with that key already exists for this client.'); end if;
    insert into public.client_esign_requests (user_id, doc_key, title, body, tax_year)
    values (target_user, doc_key_in, btrim(payload ->> 'title'), coalesce(payload ->> 'body', ''), nullif(payload ->> 'taxYear', '')::integer) returning id into new_id;
    update public.client_checklist_items set status = 'Needs Action', updated_at = now()
    where user_id = target_user and key = 'sign:' || doc_key_in and status = 'Pending';
    return jsonb_build_object('code', 'ok', 'data', jsonb_build_object('id', new_id));

  elsif p_action = 'remove_esign' then
    delete from public.client_esign_requests where id = (payload ->> 'id')::uuid and status = 'Pending';
    get diagnostics affected = row_count;
    if affected = 0 then return jsonb_build_object('code', 'conflict', 'message', 'Only unsigned documents can be removed.'); end if;
    return jsonb_build_object('code', 'ok', 'data', '{}'::jsonb);

  elsif p_action = 'set_tax_year' then
    target_user := (payload ->> 'userId')::uuid;
    if not exists (select 1 from public.client_profiles where user_id = target_user and status = 'active') then
      return jsonb_build_object('code', 'not_found'); end if;
    decision := payload ->> 'stage';
    insert into public.client_tax_years (user_id, tax_year, stage, note, filed_at)
    values (target_user, (payload ->> 'taxYear')::integer, decision, btrim(coalesce(payload ->> 'note', '')),
      case when decision in ('Filed', 'Completed') then coalesce(nullif(payload ->> 'filedAt', '')::date, current_date) end)
    on conflict (user_id, tax_year) do update set stage = excluded.stage, note = excluded.note, filed_at = excluded.filed_at, updated_at = now();
    return jsonb_build_object('code', 'ok', 'data', '{}'::jsonb);

  elsif p_action = 'set_document' then
    update public.client_documents set status = payload ->> 'status', admin_note = btrim(coalesce(payload ->> 'note', '')) where id = (payload ->> 'id')::uuid;
    get diagnostics affected = row_count;
    if affected = 0 then return jsonb_build_object('code', 'not_found'); end if;
    return jsonb_build_object('code', 'ok', 'data', '{}'::jsonb);

  elsif p_action = 'document_path' then
    select storage_path into doc_key_in from public.client_documents where id = (payload ->> 'id')::uuid;
    if doc_key_in is null then return jsonb_build_object('code', 'not_found'); end if;
    return jsonb_build_object('code', 'ok', 'data', jsonb_build_object('path', doc_key_in));
  end if;

  return jsonb_build_object('code', 'invalid', 'message', 'Unknown action.');
exception
  when invalid_text_representation or datetime_field_overflow or invalid_datetime_format or numeric_value_out_of_range
    or check_violation or string_data_right_truncation or not_null_violation or foreign_key_violation then
    return jsonb_build_object('code', 'invalid', 'message', 'Please check the values you entered.');
end;
$function$;
alter function public.admin_portal(text, jsonb) owner to postgres;
revoke all on function public.admin_portal(text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.admin_portal(text, jsonb) to service_role;

commit;
