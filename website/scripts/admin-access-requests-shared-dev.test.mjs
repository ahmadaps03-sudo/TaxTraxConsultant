import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import nextEnv from "@next/env";
import { runReview } from "../../supabase/functions/review-access-requests/core.mjs";
import { devReviewProvider } from "../../supabase/functions/review-access-requests/provider.mjs";
import { readDevKeys, devRef, devUrl, devClient, requireDevTarget } from "./supabase-shared-dev.mjs";
import { sessionTestBuild } from "./lib/session-test-build.mjs";

const run = promisify(execFile);
const namespace = randomUUID();
const labels = ["approve", "reject", "race", "unrelated", "interrupted", "committed", "failed", "confirmed", "unknown", "suspended", "deleted"];
const fixtures = Object.fromEntries(labels.map(label => [label, { id: randomUUID(), email: `admin-review-${label}.${namespace}@taxtrax.example.invalid`, name: `Synthetic Admin ${label}` }]));
const adminKey = randomBytes(32).toString("base64url");
const literal = value => `'${value.replaceAll("'", "''")}'`;
const creates = new Map();
const invites = new Map();
let keys;
let admin;
let provider;
let unrelatedUser;
let build;
let origin;
let secret;

async function query(sql) {
  requireDevTarget((await readFile("../supabase/.temp/project-ref", "utf8")).trim());
  try {
    const result = await run(process.execPath, ["node_modules/supabase/dist/supabase.js", "db", "query", "--linked", "--project-ref", devRef, "--workdir", "..", "--output", "json", sql], { timeout: 30000, maxBuffer: 1024 * 1024 });
    return JSON.parse(result.stdout).rows;
  } catch { throw new Error("Dev fixture SQL failed; raw credential-bearing output suppressed."); }
}
const detail = async label => (await provider.rpc("detail", fixtures[label].id)).data;
const action = (label, command, selected = provider) => runReview({ id: fixtures[label].id, action: command }, selected);
async function allowRetry(label) {
  await query(`update public.client_access_requests set invitation_attempted_at = now() - interval '61 seconds' where id = ${literal(fixtures[label].id)}::uuid and email = ${literal(fixtures[label].email)}`);
}

before(async () => {
  nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
  secret = process.env.ADMIN_ACCESS_REQUEST_SECRET;
  assert.ok(/^[A-Za-z0-9_-]{43,128}$/.test(secret ?? ""), "Configure the separate Dev review capability privately first");
  keys = await readDevKeys(); admin = devClient(keys.adminKey);
  await query(`insert into public.client_access_requests (id,name,email,phone,contact_consent) values ${labels.map(label => {
    const fixture = fixtures[label]; return `(${literal(fixture.id)}::uuid,${literal(fixture.name)},${literal(fixture.email)},'+44 7700 900123',true)`;
  }).join(",")}`);
  const base = devReviewProvider(devUrl, keys.adminKey);
  provider = { ...base,
    async createUser(fields) {
      const id = fields.app_metadata.taxtrax_access_request_id;
      creates.set(id, (creates.get(id) ?? 0) + 1);
      return base.createUser(fields);
    },
    async invite(email) {
      const fixture = Object.values(fixtures).find(value => value.email === email);
      assert.ok(fixture, "Invitation test refused a non-fixture identity");
      const row = (await base.rpc("detail", fixture.id)).data;
      const profile = await admin.from("client_profiles").select("user_id,status").eq("user_id", row.provisioned_user_id).single();
      assert.ok(!profile.error && profile.data?.status === "active", "Profile was not active before invitation");
      invites.set(fixture.id, (invites.get(fixture.id) ?? 0) + 1);
      const proof = await admin.auth.admin.generateLink({ type: "invite", email, options: { redirectTo: "http://localhost:3000/api/auth/activation/callback" } });
      assert.ok(!proof.error && proof.data.user?.id === row.provisioned_user_id, "Isolated no-email invitation proof generation failed");
      return { outcome: "sent", userId: proof.data.user.id };
    },
  };
  build = await sessionTestBuild(["lib/admin/access-requests.ts", "lib/api.ts", "app/api/admin/accessrequests/route.ts"]);
  origin = await build.start({ ADMIN_API_KEY: adminKey, ADMIN_ACCESS_REQUEST_SECRET: secret, SUPABASE_URL: devUrl, SUPABASE_PUBLISHABLE_KEY: keys.publishableKey }, { authOrigin: true });
});

after(async () => {
  await build?.stop();
  if (!keys) return;
  const requestIds = Object.values(fixtures).map(value => literal(value.id)).join(",");
  const identities = await query(`select id, email, raw_app_meta_data ->> 'taxtrax_access_request_id' as request_id from auth.users
    where raw_app_meta_data ->> 'taxtrax_access_request_id' in (${requestIds})`);
  await query(`delete from public.client_access_requests where id in (${requestIds}) and email like ${literal(`%.${namespace}@taxtrax.example.invalid`)}`);
  for (const identity of identities) {
    const fixture = Object.values(fixtures).find(value => value.id === identity.request_id);
    assert.ok(fixture?.email === identity.email, "Cleanup refused an unrelated identity");
    assert.ok(!(await admin.auth.admin.deleteUser(identity.id)).error, "Marked review identity cleanup failed");
  }
  if (unrelatedUser) {
    const current = await admin.auth.admin.getUserById(unrelatedUser.id);
    assert.ok(current.data.user?.app_metadata?.taxtrax_admin_review_test === namespace, "Cleanup refused an unmarked unrelated fixture");
    assert.ok(!(await admin.auth.admin.deleteUser(unrelatedUser.id)).error);
  }
});

test("real HTTP admin authorization, no-store bounded oldest-first pending list and request detail", async () => {
  const list = await fetch(`${origin}/api/admin/accessrequests`, { headers: { "x-admin-key": adminKey } });
  assert.equal(list.status, 200); assert.ok(list.headers.get("cache-control").includes("no-store"));
  const rows = (await list.json()).data;
  assert.ok(Array.isArray(rows) && rows.length <= 50 && rows.every(row => row.status === "pending"));
  assert.ok(rows.every((row, index) => !index || Date.parse(rows[index - 1].created_at) <= Date.parse(row.created_at)));
  const result = await fetch(`${origin}/api/admin/accessrequests?id=${fixtures.approve.id}`, { headers: { "x-admin-key": adminKey } });
  assert.equal(result.status, 200); const row = (await result.json()).data;
  assert.equal(row.id, fixtures.approve.id); assert.equal(row.status, "pending");
  assert.ok(!Object.keys(row).some(key => ["operation_token", "operation_expires_at"].includes(key)));
  assert.equal((await fetch(`${origin}/api/admin/accessrequests?id=${randomUUID()}`, { headers: { "x-admin-key": adminKey } })).status, 404);
});

test("unauthorized HTTP/action requests and public submission capability cannot review", async () => {
  assert.equal((await fetch(`${origin}/api/admin/accessrequests`)).status, 401);
  assert.equal((await fetch(`${origin}/api/admin/accessrequests`, { method: "PATCH", headers: { "x-admin-key": "wrong", "Content-Type": "application/json" }, body: JSON.stringify({ id: fixtures.reject.id, action: "reject" }) })).status, 401);
  assert.equal((await fetch(`${origin}/api/admin/accessrequests`, { method: "PATCH", headers: { "x-admin-key": adminKey, "Content-Type": "application/json" }, body: JSON.stringify({ id: fixtures.reject.id, action: "reject", status: "approved" }) })).status, 400);
  const result = await fetch(`${devUrl}/functions/v1/review-access-requests`, { method: "POST", headers: { apikey: keys.publishableKey, "Content-Type": "application/json", Authorization: `Bearer ${process.env.ACCESS_REQUEST_SUBMISSION_SECRET}` }, body: '{"action":"list"}' });
  assert.equal(result.status, 403); assert.equal((await detail("reject")).status, "pending");
});

test("default-deny grants persist and ordinary clients cannot call privileged review RPC", async () => {
  const roles = await query(`select role, has_table_privilege(role,'public.client_access_requests','SELECT') as read,
    has_table_privilege(role,'public.client_access_requests','UPDATE') as change,
    has_function_privilege(role,'public.admin_client_access_request(text,uuid,uuid,uuid)','EXECUTE') as review
    from (values ('anon'),('authenticated'),('service_role')) roles(role)`);
  for (const role of roles) assert.deepEqual(role, { role: role.role, read: false, change: false, review: role.role === "service_role" });
  const client = devClient(keys.publishableKey);
  assert.ok((await client.rpc("admin_client_access_request", { p_action: "list" })).error, "Anonymous client obtained review privileges");
});

test("approval creates one unconfirmed marked identity and active profile before no-email invitation proof", async () => {
  const result = await action("approve", "approve");
  assert.equal(result.status, 200); const row = result.body.data;
  assert.equal(row.status, "approved"); assert.equal(row.provisioning_status, "ready"); assert.equal(row.invitation_status, "sent");
  assert.ok(row.decided_at && row.provisioned_at && row.invitation_attempted_at && row.invitation_sent_at);
  const user = await admin.auth.admin.getUserById(row.provisioned_user_id);
  assert.ok(!user.error && !user.data.user.email_confirmed_at);
  assert.equal(user.data.user.app_metadata.taxtrax_access_request_id, fixtures.approve.id);
  const profile = await admin.from("client_profiles").select("name,status").eq("user_id", row.provisioned_user_id).single();
  assert.deepEqual(profile.data, { name: fixtures.approve.name, status: "active" });
  assert.equal(creates.get(fixtures.approve.id), 1); assert.equal(invites.get(fixtures.approve.id), 1);
});

test("repeated approval preserves identity/profile/timestamps and never automatically reinvites", async () => {
  const beforeRow = await detail("approve");
  const result = await action("approve", "approve");
  assert.equal(result.status, 200); assert.deepEqual(result.body.data, beforeRow);
  assert.equal(creates.get(fixtures.approve.id), 1); assert.equal(invites.get(fixtures.approve.id), 1);
  assert.equal((await action("approve", "reject")).status, 409);
});

test("HTTP rejection is final/idempotent and creates no identity/profile/invitation", async () => {
  const reject = () => fetch(`${origin}/api/admin/accessrequests`, { method: "PATCH", headers: { "x-admin-key": adminKey, "Content-Type": "application/json" }, body: JSON.stringify({ id: fixtures.reject.id, action: "reject" }) });
  const first = await reject(); assert.equal(first.status, 200); const firstRow = (await first.json()).data;
  const repeated = await reject(); assert.equal(repeated.status, 200); assert.deepEqual((await repeated.json()).data, firstRow);
  assert.equal(firstRow.status, "rejected"); assert.ok(firstRow.decided_at); assert.equal(firstRow.provisioned_user_id, null);
  assert.equal((await action("reject", "approve")).status, 409); assert.equal(creates.has(fixtures.reject.id), false); assert.equal(invites.has(fixtures.reject.id), false);
  const identities = await query(`select count(*)::int as count from auth.users where email = ${literal(fixtures.reject.email)}`);
  assert.deepEqual(identities, [{ count: 0 }]);
});

test("concurrent approve/reject has one terminal winner without duplicate side effects", async () => {
  const results = await Promise.all([action("race", "approve"), action("race", "reject")]);
  assert.equal(results.filter(result => result.status === 200).length, 1); assert.equal(results.filter(result => result.status === 409).length, 1);
  const row = await detail("race"); assert.ok(["approved", "rejected"].includes(row.status));
  assert.ok((creates.get(fixtures.race.id) ?? 0) <= 1 && (invites.get(fixtures.race.id) ?? 0) <= 1);
});

test("existing unrelated account at approval is untouched and permanently blocked from takeover", async () => {
  const created = await admin.auth.admin.createUser({ email: fixtures.unrelated.email, email_confirm: true, app_metadata: { taxtrax_admin_review_test: namespace } });
  assert.ok(!created.error && created.data.user); unrelatedUser = created.data.user;
  assert.ok(!(await admin.from("client_profiles").insert({ user_id: unrelatedUser.id, name: "Synthetic Unrelated Client", status: "suspended" })).error);
  const beforeUser = await admin.auth.admin.getUserById(unrelatedUser.id);
  assert.equal((await action("unrelated", "approve")).status, 409);
  assert.equal((await action("unrelated", "approve")).status, 409);
  const row = await detail("unrelated"); assert.equal(row.status, "approved"); assert.equal(row.provisioning_status, "blocked"); assert.equal(row.provisioned_user_id, null);
  const afterUser = await admin.auth.admin.getUserById(unrelatedUser.id); assert.deepEqual(afterUser.data.user, beforeUser.data.user);
  assert.deepEqual((await admin.from("client_profiles").select("name,status").eq("user_id", unrelatedUser.id).single()).data, { name: "Synthetic Unrelated Client", status: "suspended" });
  assert.equal(invites.has(fixtures.unrelated.id), false);
});

test("interruption after Auth creation resumes only the same marked identity without duplication", async () => {
  let interrupt = true;
  const interrupted = { ...provider, async rpc(action, ...args) {
    if (action === "provision" && interrupt) { interrupt = false; throw new Error("Synthetic interruption"); }
    return provider.rpc(action, ...args);
  } };
  assert.equal((await action("interrupted", "approve", interrupted)).status, 503);
  assert.equal((await detail("interrupted")).provisioning_status, "error");
  const resumed = await action("interrupted", "approve"); assert.equal(resumed.status, 200); assert.equal(resumed.body.data.provisioning_status, "ready");
  assert.equal(creates.get(fixtures.interrupted.id), 1); assert.equal(invites.get(fixtures.interrupted.id), 1);
});

test("lost profile-commit response resumes ready state without recreating/reactivating profile", async () => {
  let interrupt = true;
  const interrupted = { ...provider, async rpc(action, ...args) {
    const result = await provider.rpc(action, ...args);
    if (action === "provision" && interrupt) { interrupt = false; throw new Error("Synthetic lost commit response"); }
    return result;
  } };
  assert.equal((await action("committed", "approve", interrupted)).status, 503);
  const row = await detail("committed"); assert.equal(row.provisioning_status, "ready"); assert.equal(row.invitation_status, "not_attempted");
  assert.equal((await action("committed", "approve")).status, 200);
  assert.equal(creates.get(fixtures.committed.id), 1); assert.equal(invites.get(fixtures.committed.id), 1);
});

test("invitation failure retains approval/profile; repeat approval does not send; explicit retry is throttled", async () => {
  let attempted = 0;
  const failing = { ...provider, async invite() { attempted++; return { outcome: "failed" }; } };
  const result = await action("failed", "approve", failing); assert.equal(result.status, 200);
  assert.equal(result.body.data.provisioning_status, "ready"); assert.equal(result.body.data.invitation_status, "failed");
  assert.equal((await action("failed", "approve", failing)).status, 200); assert.equal(attempted, 1);
  assert.equal((await action("failed", "resend_invite")).status, 409);
  await allowRetry("failed");
  const retried = await action("failed", "resend_invite"); assert.equal(retried.status, 200); assert.equal(retried.body.data.invitation_status, "sent");
  assert.equal(creates.get(fixtures.failed.id), 1);
});

test("confirmed account refuses resend and existing profile/approval stays unchanged", async () => {
  const approved = await action("confirmed", "approve"); assert.equal(approved.status, 200);
  const userId = approved.body.data.provisioned_user_id;
  assert.ok(!(await admin.auth.admin.updateUserById(userId, { email_confirm: true })).error);
  await allowRetry("confirmed");
  const count = invites.get(fixtures.confirmed.id);
  assert.equal((await action("confirmed", "resend_invite")).status, 409);
  assert.equal(invites.get(fixtures.confirmed.id), count);
  assert.equal((await detail("confirmed")).status, "approved");
  assert.equal((await admin.from("client_profiles").select("status").eq("user_id", userId).single()).data.status, "active");
});

test("uncertain invitation response is recorded and never automatically replayed by approval", async () => {
  let attempts = 0;
  const uncertain = { ...provider, async invite() { attempts++; throw new Error("Synthetic transport interruption"); } };
  const result = await action("unknown", "approve", uncertain); assert.equal(result.status, 200); assert.equal(result.body.data.invitation_status, "unknown");
  await action("unknown", "approve", uncertain); assert.equal(attempts, 1);
});

test("suspended provisioned profile is never reactivated by resend", async () => {
  const result = await action("suspended", "approve"); assert.equal(result.status, 200);
  assert.ok(!(await admin.from("client_profiles").update({ status: "suspended" }).eq("user_id", result.body.data.provisioned_user_id)).error);
  await allowRetry("suspended");
  assert.equal((await action("suspended", "resend_invite")).status, 409);
  assert.equal((await admin.from("client_profiles").select("status").eq("user_id", result.body.data.provisioned_user_id).single()).data.status, "suspended");
});

test("expired attempt claim is fenced; approval records unknown instead of sending again", async () => {
  const fixture = fixtures.deleted;
  const oldOperation = randomUUID();
  assert.equal((await provider.rpc("approve", fixture.id, oldOperation)).claimed, true);
  const created = await provider.createUser({ email: fixture.email, email_confirm: false, app_metadata: { taxtrax_client_invitation: "taxtrax-client-invite-v1", taxtrax_access_request_id: fixture.id } });
  assert.equal((await provider.rpc("provision", fixture.id, oldOperation, created.id)).code, "ok");
  assert.equal((await provider.rpc("invite_start", fixture.id, oldOperation, created.id)).code, "ok");
  await query(`update public.client_access_requests set operation_expires_at = now() - interval '1 second' where id = ${literal(fixture.id)}::uuid and email = ${literal(fixture.email)}`);
  const resumed = await action("deleted", "approve"); assert.equal(resumed.status, 200); assert.equal(resumed.body.data.invitation_status, "unknown");
  assert.equal((await provider.rpc("invite_sent", fixture.id, oldOperation)).code, "busy");
  assert.equal(invites.has(fixture.id), false);
});

test("fixture account/profile uniqueness and HTTP logs contain no capability/project key", async () => {
  const ids = Object.values(fixtures).map(value => literal(value.id)).join(",");
  const duplicates = await query(`select count(*)::int as count from (select raw_app_meta_data ->> 'taxtrax_access_request_id' from auth.users
    where raw_app_meta_data ->> 'taxtrax_access_request_id' in (${ids}) group by 1 having count(*) > 1) duplicates`);
  assert.deepEqual(duplicates, [{ count: 0 }]);
  assert.ok(!build.logsContain([secret, keys.adminKey, adminKey]), "Private credential entered HTTP logs");
});
