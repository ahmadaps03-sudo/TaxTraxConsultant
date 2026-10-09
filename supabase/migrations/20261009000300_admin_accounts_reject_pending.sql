begin;

create function public.admin_client_reject_pending(
  p_action text, p_id uuid default null, p_operation uuid default null, p_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  request_row public.client_access_requests%rowtype;
begin
  if p_action <> 'reject_pending' or p_id is null then return jsonb_build_object('code', 'conflict'); end if;
  select * into request_row from public.client_access_requests where id = p_id for update;
  if not found then return jsonb_build_object('code', 'not_found'); end if;
  if request_row.status = 'pending' then
    update public.client_access_requests set status = 'rejected', decided_at = now()
    where id = p_id returning * into request_row;
  elsif request_row.status <> 'rejected' then
    return jsonb_build_object('code', 'conflict');
  end if;
  return jsonb_build_object('code', 'ok', 'claimed', false,
    'data', to_jsonb(request_row) - 'operation_token' - 'operation_expires_at');
end;
$function$;

alter function public.admin_client_reject_pending(text, uuid, uuid, uuid) owner to postgres;
revoke all on function public.admin_client_reject_pending(text, uuid, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.admin_client_reject_pending(text, uuid, uuid, uuid) to service_role;

commit;
