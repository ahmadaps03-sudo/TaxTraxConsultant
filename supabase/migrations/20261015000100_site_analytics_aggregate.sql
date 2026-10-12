begin;

create function public.site_analytics_aggregate(p_days integer)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $function$
declare
  since_day date := (now() at time zone 'UTC')::date - (p_days - 1);
begin
  if p_days is null or p_days not between 1 and 90 then
    raise exception 'Invalid analytics interval.' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'views', (select count(*) from public.site_page_views where day >= since_day),
    'visitors', (select count(distinct day::text || visitor) from public.site_page_views where day >= since_day),
    'byDay', coalesce((select jsonb_agg(to_jsonb(rows)) from (
      select day::text as day, count(*) as views, count(distinct visitor) as visitors
      from public.site_page_views where day >= since_day group by day
    ) as rows), '[]'::jsonb),
    'countries', coalesce((select jsonb_agg(to_jsonb(rows)) from (
      select country, count(*) as views, count(distinct day::text || visitor) as visitors
      from public.site_page_views where day >= since_day group by country
      order by visitors desc, views desc limit 10
    ) as rows), '[]'::jsonb),
    'pages', coalesce((select jsonb_agg(to_jsonb(rows)) from (
      select path, count(*) as views from public.site_page_views where day >= since_day
      group by path order by views desc limit 8
    ) as rows), '[]'::jsonb),
    'referrers', coalesce((select jsonb_agg(to_jsonb(rows)) from (
      select referrer, count(*) as views from public.site_page_views
      where day >= since_day and referrer is not null
      group by referrer order by views desc limit 6
    ) as rows), '[]'::jsonb),
    'devices', coalesce((select jsonb_agg(to_jsonb(rows)) from (
      select device, count(distinct day::text || visitor) as visitors
      from public.site_page_views where day >= since_day
      group by device order by visitors desc
    ) as rows), '[]'::jsonb)
  );
end;
$function$;

alter function public.site_analytics_aggregate(integer) owner to postgres;
revoke all on function public.site_analytics_aggregate(integer) from public, anon, authenticated, service_role;
grant execute on function public.site_analytics_aggregate(integer) to service_role;

commit;
