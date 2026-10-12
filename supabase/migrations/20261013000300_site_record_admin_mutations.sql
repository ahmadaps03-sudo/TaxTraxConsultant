begin;

create function public.site_update_record(p_collection text, p_id text, p_patch jsonb)
returns table(id text, created_at timestamptz, data jsonb)
language plpgsql security definer set search_path = ''
as $function$
begin
  if p_collection is null or p_collection not in ('messages', 'bookings', 'leads', 'posts', 'videos')
    or p_id is null or char_length(p_id) not between 1 and 120 or p_id ~ '[[:cntrl:]]'
    or p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb
    or p_patch ?| array['id', 'createdAt', 'created_at'] then
    raise exception 'Invalid site record update.' using errcode = '22023';
  end if;
  return query
    update public.site_records as record
      set data = record.data || p_patch
      where record.collection = p_collection and record.id = p_id
      returning record.id, record.created_at, record.data;
end;
$function$;
alter function public.site_update_record(text, text, jsonb) owner to postgres;
revoke all on function public.site_update_record(text, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.site_update_record(text, text, jsonb) to service_role;

create function public.site_delete_record(p_collection text, p_id text)
returns table(id text, created_at timestamptz, data jsonb)
language plpgsql security definer set search_path = ''
as $function$
begin
  if p_collection is null or p_collection not in ('messages', 'bookings', 'leads', 'posts', 'videos')
    or p_id is null or char_length(p_id) not between 1 and 120 or p_id ~ '[[:cntrl:]]' then
    raise exception 'Invalid site record deletion.' using errcode = '22023';
  end if;
  return query
    delete from public.site_records as record
      where record.collection = p_collection and record.id = p_id
      returning record.id, record.created_at, record.data;
end;
$function$;
alter function public.site_delete_record(text, text) owner to postgres;
revoke all on function public.site_delete_record(text, text) from public, anon, authenticated, service_role;
grant execute on function public.site_delete_record(text, text) to service_role;

commit;
