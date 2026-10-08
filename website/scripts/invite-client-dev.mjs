import { fileURLToPath } from "node:url";
import path from "node:path";
import { devClient, devRef, isDevProvisioningKey, readDevKeys, requireDevTarget } from "./supabase-shared-dev.mjs";

export const invitationMarker = "taxtrax-client-invite-v1";
export const activationRedirect = "http://localhost:3000/api/auth/activation/callback";
export class InvitationSetupError extends Error {}

export function invitationInput(command, input) {
  if (!["create", "resend"].includes(command) || !input || typeof input !== "object" || Array.isArray(input)) throw new InvitationSetupError("Use create or resend with a private JSON input.");
  const allowed = command === "create" ? ["email", "name", "approved", "synthetic"] : ["email", "synthetic"];
  if (Object.keys(input).some(key => !allowed.includes(key)) || input.synthetic !== true) throw new InvitationSetupError("This Dev tool accepts designated synthetic identities only, with no extra fields.");
  if (typeof input.email !== "string" || /[\u0000-\u001f\u007f-\u009f]/u.test(input.email)) throw new InvitationSetupError("Invalid invitation email.");
  const email = input.email.trim().toLowerCase();
  const [local, domain] = email.split("@");
  if (email.length > 254 || !local || local.length > 64 || !/^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/i.test(local)
    || !domain || email.split("@").length !== 2 || domain.split(".").length < 2
    || !domain.split(".").every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))) throw new InvitationSetupError("Invalid invitation email.");
  if (command === "create" && (input.approved !== true || typeof input.name !== "string" || input.name !== input.name.trim()
    || [...input.name].length < 1 || [...input.name].length > 100 || /[\u0000-\u001f\u007f-\u009f]/u.test(input.name))) throw new InvitationSetupError("An explicit owner approval and valid trimmed profile name are required.");
  return { email, name: input.name };
}

export async function issueDevInvitation(admin, command, input, ref = devRef) {
  requireDevTarget(ref);
  const fields = invitationInput(command, input);
  let existing;
  for (let page = 1; ; page++) {
    const listed = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (listed.error) throw new InvitationSetupError("Cannot inspect Dev identities. No invitation was issued.");
    existing = listed.data.users.find(user => user.email?.toLowerCase() === fields.email);
    if (existing || listed.data.users.length < 100) break;
  }
  if (command === "create" && existing) throw new InvitationSetupError("Account already exists. It was not changed or reinvited; resend is a separate explicit operation.");
  if (command === "resend" && (!existing || existing.email_confirmed_at || existing.app_metadata?.taxtrax_client_invitation !== invitationMarker)) throw new InvitationSetupError("Resend requires an existing unconfirmed identity created by this invite tool. Confirmed accounts are never reinvited; use recovery if setup was interrupted after verification.");
  let user = existing;
  if (command === "create") {
    const created = await admin.auth.admin.createUser({ email: fields.email, email_confirm: false, app_metadata: { taxtrax_client_invitation: invitationMarker } });
    if (created.error || !created.data.user) throw new InvitationSetupError("Could not create the unconfirmed Dev identity. No existing account was changed.");
    user = created.data.user;
    try {
      const inserted = await admin.from("client_profiles").insert({ user_id: user.id, name: fields.name, status: "pending" });
      if (inserted.error) throw new Error();
      const approved = await admin.from("client_profiles").update({ status: "active" }).eq("user_id", user.id).select("user_id,status").single();
      if (approved.error || approved.data?.user_id !== user.id || approved.data?.status !== "active") throw new Error();
    } catch {
      const removed = await admin.auth.admin.deleteUser(user.id);
      if (removed.error) throw new InvitationSetupError("Profile setup failed and cleanup could not be confirmed. Owner inspection is required; no invitation was issued.");
      throw new InvitationSetupError("Profile setup failed; the new identity was removed. No invitation was issued.");
    }
  }
  const validated = await admin.auth.admin.getUserById(user.id);
  const profile = await admin.from("client_profiles").select("user_id,name,status").eq("user_id", user.id).single();
  if (validated.error || validated.data.user?.id !== user.id || validated.data.user?.email !== fields.email || validated.data.user?.email_confirmed_at
    || validated.data.user?.app_metadata?.taxtrax_client_invitation !== invitationMarker
    || profile.error || profile.data?.user_id !== user.id || profile.data?.status !== "active") throw new InvitationSetupError("Invitation eligibility could not be confirmed. No invitation was issued; owner inspection is required. Approval was not changed.");
  const sent = await admin.auth.admin.inviteUserByEmail(fields.email, { redirectTo: activationRedirect });
  if (sent.error || sent.data.user?.id !== user.id) throw new InvitationSetupError("Invitation delivery was not confirmed. The approved unconfirmed account is retained; inspect the Dev email setup and explicitly resend if appropriate.");
  return { ok: true };
}

async function privateInput() {
  let content = "";
  for await (const chunk of process.stdin) {
    content += chunk.toString();
    if (Buffer.byteLength(content) > 4096) throw new InvitationSetupError("Private invitation input is too large.");
  }
  try { return JSON.parse(content); } catch { throw new InvitationSetupError("Provide valid JSON through stdin; do not put identity data or credentials in command arguments."); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, ...extra] = process.argv.slice(2);
    if (extra.length || !["create", "resend"].includes(command)) throw new InvitationSetupError("Use create or resend only. Input is private JSON through stdin; no remote targets are accepted.");
    const input = await privateInput();
    invitationInput(command, input);
    const keys = await readDevKeys();
    if (!isDevProvisioningKey(keys.adminKey)) throw new InvitationSetupError("Owner Dev provisioning access is required. Never add privileged credentials to website environment files.");
    await issueDevInvitation(devClient(keys.adminKey), command, input);
    console.log("Dev invitation sent for the approved synthetic identity. No credentials, identity data or links printed.");
  } catch (error) {
    console.error(error instanceof InvitationSetupError ? error.message : "Dev invitation failed. Check owner Dev access/configuration privately; sensitive details are suppressed.");
    process.exitCode = 1;
  }
}
