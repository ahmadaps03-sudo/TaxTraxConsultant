-- Private Storage bucket for client documents. Objects live at  <client user id>/<uuid>.<ext>  so the first path
-- segment identifies the owner. Skipped automatically where the Storage service is not installed (local config.toml has
-- storage disabled), so the other portal migrations still apply there.
begin;

do $storage$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'Storage is not installed here; skipping the client-documents bucket and its policies.';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('client-documents', 'client-documents', false, 26214400, array['application/pdf', 'image/jpeg', 'image/png', 'text/csv',
    'application/vnd.ms-excel', 'application/msword',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
  on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

  execute $p$create policy client_documents_owner_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'client-documents' and (storage.foldername(name))[1] = (select auth.uid())::text
      and (select private.client_is_active_live()))$p$;
  execute $p$create policy client_documents_owner_read on storage.objects for select to authenticated
    using (bucket_id = 'client-documents' and (storage.foldername(name))[1] = (select auth.uid())::text
      and (select private.client_is_active_live()))$p$;
  -- A client may only delete a file that staff have not reviewed (portal_delete_document removes the row first).
  execute $p$create policy client_documents_owner_delete on storage.objects for delete to authenticated
    using (bucket_id = 'client-documents' and (storage.foldername(name))[1] = (select auth.uid())::text
      and (select private.client_is_active_live())
      and not exists (select 1 from public.client_documents as doc where doc.storage_path = name and doc.status <> 'Received'))$p$;
end
$storage$;

commit;
