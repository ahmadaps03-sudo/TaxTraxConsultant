begin;

alter policy site_published_content_read on public.site_records
  using (collection in ('posts', 'videos') and data -> 'published' = 'true'::jsonb);

commit;
