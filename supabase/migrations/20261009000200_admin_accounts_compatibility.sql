begin;

alter table public.client_access_requests drop constraint access_request_status;
alter table public.client_access_requests add constraint access_request_status
  check (status in ('pending', 'approved', 'rejected', 'suspended'));

create function public.admin_client_account(
  p_action text, p_id uuid default null, p_operation uuid default null, p_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  request_row public.client_access_requests%rowtype;
  identity_row auth.users%rowtype;
  profile_row public.client_profiles%rowtype;
  response_data jsonb;
begin
  if p_action = 'list_all' then
    select coalesce(jsonb_agg(to_jsonb(records) - 'operation_token' - 'operation_expires_at'
      order by records.created_at desc, records.id desc), '[]'::jsonb)
    into response_data from public.client_access_requests records;
    return jsonb_build_object('code', 'ok', 'data', response_data);
  end if;

  if p_id is null then return jsonb_build_object('code', 'conflict'); end if;
  select * into request_row from public.client_access_requests where id = p_id for update;
  if not found then return jsonb_build_object('code', 'not_found'); end if;

  if p_action = 'set_approved' then
    if request_row.status = 'suspended' then
      if request_row.provisioning_status <> 'ready' or request_row.provisioned_user_id is null
        or request_row.operation_expires_at > now() then return jsonb_build_object('code', 'conflict'); end if;
      select * into identity_row from auth.users where id = request_row.provisioned_user_id;
      select * into profile_row from public.client_profiles where user_id = request_row.provisioned_user_id for update;
      if identity_row.id is null or lower(btrim(identity_row.email)) is distinct from request_row.email
        or identity_row.raw_app_meta_data ->> 'taxtrax_client_invitation' is distinct from 'taxtrax-client-invite-v1'
        or identity_row.raw_app_meta_data ->> 'taxtrax_access_request_id' is distinct from p_id::text
        or profile_row.user_id is null or profile_row.status <> 'suspended' then
        return jsonb_build_object('code', 'ineligible');
      end if;
      update public.client_profiles set status = 'active' where user_id = request_row.provisioned_user_id;
      update public.client_access_requests set status = 'approved' where id = p_id returning * into request_row;
      return jsonb_build_object('code', 'ok', 'claimed', false,
        'data', to_jsonb(request_row) - 'operation_token' - 'operation_expires_at');
    end if;
    if request_row.status = 'rejected' then
      if request_row.provisioned_user_id is not null or request_row.provisioning_status <> 'not_started'
        or request_row.operation_token is not null or p_operation is null then
        return jsonb_build_object('code', 'ineligible');
      end if;
      update public.client_access_requests set status = 'approved', decided_at = now(),
        provisioning_status = 'processing', operation_token = p_operation,
        operation_expires_at = now() + interval '120 seconds'
      where id = p_id returning * into request_row;
      return jsonb_build_object('code', 'ok', 'claimed', true,
        'data', to_jsonb(request_row) - 'operation_token' - 'operation_expires_at');
    end if;
    return public.admin_client_access_request('approve', p_id, p_operation, p_user_id);
  elsif p_action = 'suspend' then
    if request_row.status = 'suspended' then
      return jsonb_build_object('code', 'ok', 'claimed', false,
        'data', to_jsonb(request_row) - 'operation_token' - 'operation_expires_at');
    end if;
    if request_row.status <> 'approved' or request_row.provisioning_status <> 'ready'
      or request_row.provisioned_user_id is null or request_row.operation_expires_at > now() then
      return jsonb_build_object('code', 'conflict');
    end if;
    select * into identity_row from auth.users where id = request_row.provisioned_user_id;
    select * into profile_row from public.client_profiles where user_id = request_row.provisioned_user_id for update;
    if identity_row.id is null or lower(btrim(identity_row.email)) is distinct from request_row.email
      or identity_row.raw_app_meta_data ->> 'taxtrax_client_invitation' is distinct from 'taxtrax-client-invite-v1'
      or identity_row.raw_app_meta_data ->> 'taxtrax_access_request_id' is distinct from p_id::text
      or profile_row.user_id is null or profile_row.status <> 'active' then
      return jsonb_build_object('code', 'ineligible');
    end if;
    delete from auth.refresh_tokens where session_id in
      (select id from auth.sessions where user_id = request_row.provisioned_user_id);
    delete from auth.sessions where user_id = request_row.provisioned_user_id;
    update public.client_profiles set status = 'suspended' where user_id = request_row.provisioned_user_id;
    update public.client_access_requests set status = 'suspended' where id = p_id returning * into request_row;
    return jsonb_build_object('code', 'ok', 'claimed', false,
      'data', to_jsonb(request_row) - 'operation_token' - 'operation_expires_at');
  end if;
  return jsonb_build_object('code', 'conflict');
end;
$function$;

alter function public.admin_client_account(text, uuid, uuid, uuid) owner to postgres;
revoke all on function public.admin_client_account(text, uuid, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.admin_client_account(text, uuid, uuid, uuid) to service_role;
revoke all on public.client_access_requests from public, anon, authenticated, service_role;

commit;
