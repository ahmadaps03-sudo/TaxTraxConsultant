begin;

revoke all on function public.portal_sign(uuid, text, boolean, text, text) from public, anon, authenticated, service_role;

create function public.portal_sign(p_id uuid, p_typed_name text, p_agree boolean)
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
  if p_agree is distinct from true then raise exception 'Please confirm you agree.' using errcode = '22023'; end if;
  if typed = '' then raise exception 'Type your full name to sign.' using errcode = '22023'; end if;
  select * into request_row from public.client_esign_requests where id = p_id and user_id = me for update;
  if not found then raise exception 'Document not found.' using errcode = 'P0002'; end if;
  if request_row.status = 'Signed' then raise exception 'This document is already signed.' using errcode = '55000'; end if;
  select name into account_name from public.client_profiles where user_id = me;
  if lower(regexp_replace(btrim(normalize(typed, nfkc)), '\s+', ' ', 'g'))
     is distinct from lower(regexp_replace(btrim(normalize(account_name, nfkc)), '\s+', ' ', 'g')) then
    raise exception 'Name does not match account.' using errcode = '22023';
  end if;
  update public.client_esign_requests set status = 'Signed', signed_at = now(), signed_name = left(typed, 120)
  where id = request_row.id;
  update public.client_checklist_items set status = 'Completed', updated_at = now()
  where user_id = me and key = 'sign:' || request_row.doc_key;
end;
$function$;
alter function public.portal_sign(uuid, text, boolean) owner to postgres;
revoke all on function public.portal_sign(uuid, text, boolean) from public, anon, authenticated, service_role;
grant execute on function public.portal_sign(uuid, text, boolean) to authenticated;

create or replace function public.portal_add_document(p_path text, p_name text, p_mime text, p_size integer, p_tag text, p_year integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  me uuid := private.require_client();
  new_id uuid;
  stored_size text;
  stored_mime text;
begin
  if p_path is null or split_part(p_path, '/', 1) <> me::text then
    raise exception 'Invalid upload.' using errcode = '22023';
  end if;
  select object.metadata ->> 'size', object.metadata ->> 'mimetype'
    into stored_size, stored_mime
    from storage.objects as object
    where object.bucket_id = 'client-documents' and object.name = p_path;
  if not found then raise exception 'Uploaded file not found.' using errcode = 'P0002'; end if;
  if p_size is null or stored_size is null or stored_size !~ '^[0-9]+$' or char_length(stored_size) > 10
    or stored_size::bigint <> p_size or stored_mime is null or stored_mime <> p_mime then
    raise exception 'Uploaded file metadata does not match.' using errcode = '22023';
  end if;
  if (select count(*) from public.client_documents where user_id = me) >= 200 then
    raise exception 'Document limit reached.' using errcode = '54000';
  end if;
  insert into public.client_documents (user_id, storage_path, file_name, mime, size_bytes, tag, tax_year)
  values (me, p_path, p_name, p_mime, p_size, p_tag, p_year) returning id into new_id;
  update public.client_checklist_items set status = 'Completed', updated_at = now()
  where user_id = me and key = 'upload-docs' and tax_year = p_year and status <> 'Completed';
  return new_id;
exception when check_violation then
  raise exception 'Document details are invalid.' using errcode = '22023';
end;
$function$;
alter function public.portal_add_document(text, text, text, integer, text, integer) owner to postgres;
revoke all on function public.portal_add_document(text, text, text, integer, text, integer) from public, anon, authenticated, service_role;
grant execute on function public.portal_add_document(text, text, text, integer, text, integer) to authenticated;

do $storage$
begin
  if to_regclass('storage.objects') is null then return; end if;

  execute $policy$alter policy client_documents_owner_insert on storage.objects
    with check (bucket_id = 'client-documents'
      and (storage.foldername(name))[1] = (select auth.uid())::text
      and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|jpe?g|png|xlsx?|docx?|csv)$'
      and (select private.client_is_active_live()))$policy$;

  execute $policy$alter policy client_documents_owner_delete on storage.objects
    using (bucket_id = 'client-documents'
      and (storage.foldername(name))[1] = (select auth.uid())::text
      and (select private.client_is_active_live())
      and not exists (select 1 from public.client_documents as doc where doc.storage_path = name))$policy$;
end;
$storage$;

commit;
