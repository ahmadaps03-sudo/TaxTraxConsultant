begin;

create table public.site_records (
  id text primary key check (char_length(id) between 1 and 120 and id !~ '[[:cntrl:]]'),
  collection text not null check (collection in ('messages', 'bookings', 'leads', 'posts', 'videos')),
  created_at timestamptz not null default now(),
  data jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 1048576),
  constraint site_record_published check (
    collection not in ('posts', 'videos') or not (data ? 'published') or jsonb_typeof(data -> 'published') = 'boolean'
  )
);
create index site_records_collection_created on public.site_records (collection, created_at desc, id desc);
create unique index site_posts_slug on public.site_records ((data ->> 'slug')) where collection = 'posts';
create index site_bookings_email on public.site_records (lower(data ->> 'email')) where collection = 'bookings';
alter table public.site_records owner to postgres;
alter table public.site_records enable row level security;
revoke all on public.site_records from public, anon, authenticated, service_role;
grant select on public.site_records to anon, authenticated;
grant select, insert, update, delete on public.site_records to service_role;
create policy site_published_content_read on public.site_records for select to anon, authenticated
  using (collection in ('posts', 'videos') and (data ->> 'published') is distinct from 'false');

create table public.site_page_views (
  id uuid primary key default gen_random_uuid(),
  ts timestamptz not null,
  day date not null,
  path text not null check (char_length(path) between 1 and 200 and path like '/%' and path !~ '[[:cntrl:]]'),
  country text not null check (country ~ '^[A-Z]{2}$'),
  visitor text not null check (visitor ~ '^[0-9a-f]{16}$'),
  referrer text check (referrer is null or (char_length(referrer) between 1 and 80 and referrer !~ '[[:cntrl:]]')),
  device text not null check (device in ('desktop', 'mobile', 'tablet')),
  constraint site_page_view_utc_day check (day = (ts at time zone 'UTC')::date)
);
create index site_page_views_day on public.site_page_views (day);
create index site_page_views_country_day on public.site_page_views (country, day);
alter table public.site_page_views owner to postgres;
alter table public.site_page_views enable row level security;
revoke all on public.site_page_views from public, anon, authenticated, service_role;
grant select, insert, delete on public.site_page_views to service_role;

create table private.site_rate_limits (
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  window_seconds integer not null check (window_seconds between 1 and 86400),
  window_start bigint not null,
  hits integer not null check (hits > 0),
  primary key (key_hash, window_seconds)
);
alter table private.site_rate_limits owner to postgres;
alter table private.site_rate_limits enable row level security;
revoke all on private.site_rate_limits from public, anon, authenticated, service_role;

create function public.site_take_rate_limit(p_hash text, p_max integer, p_window_seconds integer)
returns table(ok boolean, retry_after integer)
language plpgsql security definer set search_path = ''
as $function$
declare
  current_epoch bigint := floor(extract(epoch from clock_timestamp()))::bigint;
  bucket_start bigint;
  bucket_hits integer;
begin
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$'
    or p_max is null or p_max not between 1 and 10000
    or p_window_seconds is null or p_window_seconds not between 1 and 86400 then
    raise exception 'Invalid rate-limit input.' using errcode = '22023';
  end if;
  insert into private.site_rate_limits as bucket (key_hash, window_seconds, window_start, hits)
    values (p_hash, p_window_seconds, current_epoch, 1)
  on conflict (key_hash, window_seconds) do update
    set window_start = case when bucket.window_start + p_window_seconds <= current_epoch then current_epoch else bucket.window_start end,
        hits = case when bucket.window_start + p_window_seconds <= current_epoch then 1 else least(bucket.hits, p_max) + 1 end
  returning window_start, hits into bucket_start, bucket_hits;
  return query select bucket_hits <= p_max,
    case when bucket_hits <= p_max then 0 else greatest(1, bucket_start + p_window_seconds - current_epoch)::integer end;
end;
$function$;
alter function public.site_take_rate_limit(text, integer, integer) owner to postgres;
revoke all on function public.site_take_rate_limit(text, integer, integer) from public, anon, authenticated, service_role;
grant execute on function public.site_take_rate_limit(text, integer, integer) to service_role;

create function public.site_prune_telemetry()
returns void language plpgsql security definer set search_path = ''
as $function$
begin
  delete from public.site_page_views where ts < clock_timestamp() - interval '90 days';
  delete from private.site_rate_limits where window_start < floor(extract(epoch from clock_timestamp()))::bigint - 172800;
end;
$function$;
alter function public.site_prune_telemetry() owner to postgres;
revoke all on function public.site_prune_telemetry() from public, anon, authenticated, service_role;
grant execute on function public.site_prune_telemetry() to service_role;

commit;
