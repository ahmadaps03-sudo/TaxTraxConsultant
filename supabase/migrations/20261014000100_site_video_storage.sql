begin;

do $storage$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'Storage is not installed locally; skipping site-videos bucket and policy.';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('site-videos', 'site-videos', false, 52428800,
    array['video/mp4', 'video/webm', 'video/quicktime'])
  on conflict (id) do update
    set public = false, file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  execute $policy$create policy site_videos_no_direct_client_access on storage.objects
    as restrictive for all to anon, authenticated
    using (bucket_id <> 'site-videos')
    with check (bucket_id <> 'site-videos')$policy$;
end
$storage$;

alter table public.site_records add constraint site_video_deletion_pending_private
  check (collection <> 'videos' or data ->> '_deletePending' is distinct from 'true'
    or data -> 'published' = 'false'::jsonb);

create unique index site_video_file_unique on public.site_records ((data ->> 'file'))
  where collection = 'videos' and data ->> 'kind' = 'file';

commit;
