begin;

alter table public.client_access_requests
  drop constraint access_request_pending,
  add column decided_at timestamptz,
  add column provisioned_user_id uuid references auth.users(id) on delete set null,
  add column provisioning_status text not null default 'not_started',
  add column provisioned_at timestamptz,
  add column invitation_status text not null default 'not_attempted',
  add column invitation_attempted_at timestamptz,
  add column invitation_sent_at timestamptz,
  add column operation_token uuid,
  add column operation_expires_at timestamptz,
  add constraint access_request_status check (status in ('pending', 'approved', 'rejected')),
  add constraint access_request_decision check ((status = 'pending') = (decided_at is null)),
  add constraint access_request_provisioning check (provisioning_status in ('not_started', 'processing', 'ready', 'error', 'blocked')),
  add constraint access_request_invitation check (invitation_status in ('not_attempted', 'attempting', 'sent', 'failed', 'unknown')),
  add constraint access_request_operation check ((operation_token is null) = (operation_expires_at is null));

create index client_access_requests_pending_order on public.client_access_requests (created_at, id) where status = 'pending';

create function public.admin_client_access_request(
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
  identity_count integer;
  response_data jsonb;
begin
  if p_action = 'list' then
    select coalesce(jsonb_agg(to_jsonb(pending) - 'operation_token' - 'operation_expires_at' order by pending.created_at, pending.id), '[]'::jsonb)
    into response_data from (select * from public.client_access_requests where status = 'pending' order by created_at, id limit 50) pending;
    return jsonb_build_object('code', 'ok', 'data', response_data);
  end if;

  select * into request_row from public.client_access_requests where id = p_id for update;
  if not found then return jsonb_build_object('code', 'not_found'); end if;
  if p_action = 'detail' then
    return jsonb_build_object('code', 'ok', 'data', to_jsonb(request_row) - 'operation_token' - 'operation_expires_at');
  elsif p_action = 'reject' then
    if request_row.status = 'approved' then return jsonb_build_object('code', 'conflict'); end if;
    if request_row.status = 'pending' then
      update public.client_access_requests set status = 'rejected', decided_at = now() where id = p_id returning * into request_row;
    end if;
  elsif p_action in ('approve', 'resend_invite') then
    if request_row.status = 'rejected' then return jsonb_build_object('code', 'conflict'); end if;
    if p_action = 'resend_invite' and (request_row.status <> 'approved' or request_row.provisioning_status <> 'ready') then
      return jsonb_build_object('code', 'conflict');
    end if;
    if request_row.operation_expires_at > now() then return jsonb_build_object('code', 'busy'); end if;
    if request_row.invitation_status = 'attempting' then
      update public.client_access_requests set invitation_status = 'unknown', operation_token = null, operation_expires_at = null
      where id = p_id returning * into request_row;
    end if;
    if p_action = 'approve' and request_row.provisioning_status = 'blocked' then return jsonb_build_object('code', 'ineligible'); end if;
    if p_action = 'approve' and request_row.provisioning_status = 'ready' and request_row.invitation_status <> 'not_attempted' then
      return jsonb_build_object('code', 'ok', 'claimed', false, 'data', to_jsonb(request_row) - 'operation_token' - 'operation_expires_at');
    end if;
    if p_action = 'resend_invite' and request_row.invitation_attempted_at > now() - interval '60 seconds' then
      return jsonb_build_object('code', 'busy');
    end if;
    if p_operation is null then return jsonb_build_object('code', 'conflict'); end if;
    update public.client_access_requests set status = 'approved', decided_at = coalesce(decided_at, now()),
      provisioning_status = case when provisioning_status = 'ready' then 'ready' else 'processing' end,
      operation_token = p_operation, operation_expires_at = now() + interval '120 seconds'
    where id = p_id returning * into request_row;
    return jsonb_build_object('code', 'ok', 'claimed', true, 'data', to_jsonb(request_row) - 'operation_token' - 'operation_expires_at');
  else
    if request_row.status <> 'approved' or request_row.operation_token is distinct from p_operation
      or p_operation is null or request_row.operation_expires_at <= now() then return jsonb_build_object('code', 'busy'); end if;
    if p_action = 'identity' then
      select count(*) into identity_count from auth.users where lower(btrim(email)) = request_row.email;
      select * into identity_row from auth.users where lower(btrim(email)) = request_row.email limit 1;
      if identity_count > 1 or (identity_count = 1 and (
        identity_row.email_confirmed_at is not null
        or identity_row.raw_app_meta_data ->> 'taxtrax_client_invitation' is distinct from 'taxtrax-client-invite-v1'
        or identity_row.raw_app_meta_data ->> 'taxtrax_access_request_id' is distinct from p_id::text
        or (request_row.provisioned_user_id is not null and request_row.provisioned_user_id <> identity_row.id)
      )) or (identity_count = 0 and (request_row.provisioned_user_id is not null or request_row.provisioned_at is not null)) then
        return jsonb_build_object('code', 'ineligible');
      end if;
      return jsonb_build_object('code', 'ok', 'user_id', identity_row.id);
    elsif p_action in ('provision', 'invite_start') then
      select * into identity_row from auth.users where id = p_user_id;
      if not found or identity_row.email_confirmed_at is not null or lower(btrim(identity_row.email)) is distinct from request_row.email
        or identity_row.raw_app_meta_data ->> 'taxtrax_client_invitation' is distinct from 'taxtrax-client-invite-v1'
        or identity_row.raw_app_meta_data ->> 'taxtrax_access_request_id' is distinct from p_id::text
        or (request_row.provisioned_user_id is not null and request_row.provisioned_user_id <> p_user_id) then
        return jsonb_build_object('code', 'ineligible');
      end if;
      if p_action = 'provision' then
        if request_row.provisioned_at is not null and request_row.provisioned_user_id is null then return jsonb_build_object('code', 'ineligible'); end if;
        insert into public.client_profiles (user_id, name, status) values (p_user_id, request_row.name, 'pending') on conflict (user_id) do nothing;
      end if;
      select * into profile_row from public.client_profiles where user_id = p_user_id for update;
      if not found or profile_row.name <> request_row.name or profile_row.status = 'suspended'
        or (request_row.provisioning_status = 'ready' and profile_row.status <> 'active') then return jsonb_build_object('code', 'ineligible'); end if;
      if p_action = 'provision' then
        update public.client_profiles set status = 'active' where user_id = p_user_id and status = 'pending';
        update public.client_access_requests set provisioned_user_id = p_user_id, provisioning_status = 'ready',
          provisioned_at = coalesce(provisioned_at, now()) where id = p_id returning * into request_row;
      else
        if request_row.provisioning_status <> 'ready' or request_row.provisioned_user_id is distinct from p_user_id
          or profile_row.status <> 'active' or request_row.invitation_status = 'attempting' then return jsonb_build_object('code', 'ineligible'); end if;
        update public.client_access_requests set invitation_status = 'attempting', invitation_attempted_at = now()
        where id = p_id returning * into request_row;
      end if;
    elsif p_action in ('invite_sent', 'invite_failed', 'invite_unknown') then
      if request_row.invitation_status <> 'attempting' then return jsonb_build_object('code', 'conflict'); end if;
      update public.client_access_requests set invitation_status = substring(p_action from 8),
        invitation_sent_at = case when p_action = 'invite_sent' then now() else invitation_sent_at end,
        operation_token = null, operation_expires_at = null where id = p_id returning * into request_row;
    elsif p_action in ('release', 'error', 'block') then
      update public.client_access_requests set
        provisioning_status = case when provisioning_status = 'ready' then 'ready' when p_action = 'block' then 'blocked' when p_action = 'error' then 'error' else provisioning_status end,
        invitation_status = case when invitation_status = 'attempting' then 'unknown' else invitation_status end,
        operation_token = null, operation_expires_at = null where id = p_id returning * into request_row;
    else return jsonb_build_object('code', 'conflict');
    end if;
  end if;
  return jsonb_build_object('code', 'ok', 'data', to_jsonb(request_row) - 'operation_token' - 'operation_expires_at');
end;
$function$;

alter function public.admin_client_access_request(text, uuid, uuid, uuid) owner to postgres;
revoke all on function public.admin_client_access_request(text, uuid, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.admin_client_access_request(text, uuid, uuid, uuid) to service_role;
revoke all on public.client_access_requests from public, anon, authenticated, service_role;

commit;
