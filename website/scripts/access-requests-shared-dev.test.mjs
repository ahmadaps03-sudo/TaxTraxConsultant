import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import test, { before, after } from "node:test";
import { chromium } from "playwright";
import nextEnv from "@next/env";
import { devRef, devUrl, devClient, readDevKeys, requireDevTarget } from "./supabase-shared-dev.mjs";
import { sessionTestBuild } from "./lib/session-test-build.mjs";

const run = promisify(execFile);
const namespace = randomUUID();
const email = `access.${namespace}@taxtrax.example.invalid`;
const existingEmail = `access-existing.${namespace}@taxtrax.example.invalid`;
const authOnlyEmail = `access-auth-only.${namespace}@taxtrax.example.invalid`;
const marker = "taxtrax-access-request-isolated-test";
const fixturePassword = `${randomBytes(24).toString("base64url")}Aa9!`;
const literal = value => `'${value.replaceAll("'", "''")}'`;
let keys;
let admin;
let existingUser;
let authOnlyUser;
let ordinary;
let session;
let build;
let origin;
let browser;
let context;
let page;
let secret;
let submitted;
let address = 0;

async function query(sql) {
  requireDevTarget((await readFile("../supabase/.temp/project-ref", "utf8")).trim());
  try {
    const result = await run(process.execPath, ["node_modules/supabase/dist/supabase.js", "db", "query", "--linked", "--project-ref", devRef,
      "--workdir", "..", "--output", "json", sql], { timeout: 30000, maxBuffer: 1024 * 1024 });
    return JSON.parse(result.stdout).rows;
  } catch { throw new Error("Approved Dev owner SQL access failed; raw output suppressed."); }
}

const body = (target = email) => ({ name: "Synthetic Access Requester", email: target, phone: "+44 7700 900123", company: "Synthetic Company", contact_consent: true, website: "" });
async function post(payload, headers = {}) {
  return fetch(`${origin}/api/portal/access-requests`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json",
    "X-TaxTrax-Auth": "1", "X-Forwarded-For": `127.0.0.${++address}`, ...headers }, body: JSON.stringify(payload), redirect: "error" });
}

before(async () => {
  nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
  secret = process.env.ACCESS_REQUEST_SUBMISSION_SECRET;
  assert.ok(/^[A-Za-z0-9_-]{43,128}$/.test(secret ?? ""), "Configure the scoped Dev submission secret privately first");
  keys = await readDevKeys();
  admin = devClient(keys.adminKey);
  await query("select id from public.client_access_requests limit 0");
  const created = await admin.auth.admin.createUser({ email: existingEmail, email_confirm: true, password: fixturePassword,
    app_metadata: { taxtrax_access_request_test: marker, namespace } });
  assert.ok(!created.error && created.data.user, "Isolated existing-account fixture setup failed");
  existingUser = created.data.user;
  assert.ok(!(await admin.from("client_profiles").insert({ user_id: existingUser.id, name: "Synthetic Existing Client", status: "active" })).error);
  const authOnly = await admin.auth.admin.createUser({ email: authOnlyEmail, email_confirm: true, password: fixturePassword,
    app_metadata: { taxtrax_access_request_test: marker, namespace } });
  assert.ok(!authOnly.error && authOnly.data.user, "Isolated Auth-only fixture setup failed");
  authOnlyUser = authOnly.data.user;
  ordinary = devClient(keys.publishableKey);
  const login = await ordinary.auth.signInWithPassword({ email: existingEmail, password: fixturePassword });
  assert.ok(!login.error && login.data.session, "Isolated authenticated REST assertion session failed");
  session = login.data.session;
  build = await sessionTestBuild([
    "lib/auth/request.ts", "lib/auth/handlers.ts", "lib/access-requests/handler.ts", "app/api/portal/access-requests/route.ts",
    "app/portal/page.tsx", "components/portal/PortalClient.tsx",
  ], { realPortal: true });
  origin = await build.start({ SUPABASE_URL: devUrl, SUPABASE_PUBLISHABLE_KEY: keys.publishableKey, ACCESS_REQUEST_SUBMISSION_SECRET: secret, TRUST_PROXY: "1" }, { authOrigin: true });
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext(); page = await context.newPage();
});

after(async () => {
  await browser?.close(); await build?.stop();
  await ordinary?.auth.signOut({ scope: "local" }).catch(() => {});
  if (keys) await query(`delete from public.client_access_requests where status = 'pending' and email in (${literal(email)},${literal(existingEmail)},${literal(authOnlyEmail)})`);
  for (const user of [existingUser, authOnlyUser].filter(Boolean)) {
    const current = await admin.auth.admin.getUserById(user.id);
    assert.ok(current.data.user?.app_metadata?.taxtrax_access_request_test === marker && current.data.user?.app_metadata?.namespace === namespace, "Cleanup refused an unmarked identity");
    assert.ok(!(await admin.auth.admin.deleteUser(user.id)).error, "Isolated fixture cleanup failed");
  }
});

test("public UI submits consent to the dedicated endpoint and stores a pending request", async () => {
  await page.goto(`${origin}/portal`);
  await page.getByRole("tab", { name: "Create account", exact: true }).click();
  await page.getByLabel("Full name", { exact: true }).fill("Synthetic Access Requester");
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Phone / WhatsApp", { exact: true }).fill("+44 7700 900123");
  await page.locator('input[name="company"]').fill("Synthetic Company");
  await page.getByRole("checkbox", { name: /I agree that TaxTrax may contact me/ }).check({ force: true });
  const received = page.waitForResponse(response => new URL(response.url()).pathname === "/api/portal/access-requests");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  const result = await received;
  submitted = result.request().postDataJSON();
  assert.equal(result.status(), 200); assert.deepEqual(await result.json(), { ok: true });
  assert.equal(submitted.contact_consent, true); assert.equal(result.request().headers()["x-taxtrax-auth"], "1");
  assert.ok(!Object.keys(submitted).some(key => ["password", "status", "approved", "user_id"].includes(key)));
  assert.equal(result.headers()["set-cookie"], undefined);
  await page.getByRole("heading", { name: "Request received", exact: true }).waitFor();
  const rows = await query(`select name,email,phone,company,contact_consent,status from public.client_access_requests where email = ${literal(email)}`);
  assert.deepEqual(rows, [{ name: "Synthetic Access Requester", email, phone: "+44 7700 900123", company: "Synthetic Company", contact_consent: true, status: "pending" }]);
});

test("duplicate/case-normalized resubmission acknowledges identically without replacing original data", async () => {
  const result = await post({ ...body(), email: ` ${email.toUpperCase()} `, name: "Synthetic Replacement", phone: "+44 7700 900456", company: "" });
  assert.equal(result.status, 200); assert.deepEqual(await result.json(), { ok: true });
  const rows = await query(`select name,phone,status from public.client_access_requests where email = ${literal(email)}`);
  assert.deepEqual(rows, [{ name: "Synthetic Access Requester", phone: "+44 7700 900123", status: "pending" }]);
});

test("existing Auth-only email gets generic success without an access request or account changes", async () => {
  const beforeUser = await admin.auth.admin.getUserById(authOnlyUser.id);
  const result = await post({ ...body(authOnlyEmail), email: ` ${authOnlyEmail.toUpperCase()} ` });
  assert.equal(result.status, 200); assert.deepEqual(await result.json(), { ok: true });
  assert.equal(result.headers.get("set-cookie"), null);
  const requests = await query(`select count(*)::int as count from public.client_access_requests where email = ${literal(authOnlyEmail)}`);
  assert.deepEqual(requests, [{ count: 0 }]);
  const afterUser = await admin.auth.admin.getUserById(authOnlyUser.id);
  assert.ok(!beforeUser.error && !afterUser.error);
  assert.deepEqual(afterUser.data.user, beforeUser.data.user);
  const profiles = await query(`select count(*)::int as count from public.client_profiles where user_id = ${literal(authOnlyUser.id)}::uuid`);
  assert.deepEqual(profiles, [{ count: 0 }]);
});

test("existing client profile gets generic success without an access request, identity change or session", async () => {
  const beforeUser = await admin.auth.admin.getUserById(existingUser.id);
  const beforeProfile = await admin.from("client_profiles").select("*").eq("user_id", existingUser.id).single();
  assert.ok(!beforeUser.error && !beforeProfile.error);
  const result = await post({ ...body(existingEmail), email: ` ${existingEmail.toUpperCase()} ` });
  assert.equal(result.status, 200); assert.deepEqual(await result.json(), { ok: true });
  assert.equal(result.headers.get("set-cookie"), null);
  const requests = await query(`select count(*)::int as count from public.client_access_requests where email = ${literal(existingEmail)}`);
  assert.deepEqual(requests, [{ count: 0 }]);
  const afterUser = await admin.auth.admin.getUserById(existingUser.id);
  const afterProfile = await admin.from("client_profiles").select("*").eq("user_id", existingUser.id).single();
  assert.ok(!afterUser.error && !afterProfile.error);
  assert.deepEqual(afterUser.data.user, beforeUser.data.user);
  assert.deepEqual(afterProfile.data, beforeProfile.data);
  const identities = await query(`select (select count(*)::int from auth.users where email = ${literal(email)}) as new_users,
    (select count(*)::int from auth.users where email = ${literal(existingEmail)}) as existing_users`);
  assert.deepEqual(identities, [{ new_users: 0, existing_users: 1 }]);
  const profile = await admin.from("client_profiles").select("name,status").eq("user_id", existingUser.id).single();
  assert.deepEqual(profile.data, { name: "Synthetic Existing Client", status: "active" });
  await page.goto(`${origin}/portal`);
  assert.equal(await page.getByRole("heading", { name: "Client Portal Login", exact: true }).count(), 1);
  const exposed = await page.evaluate(() => document.documentElement.innerHTML + document.cookie + JSON.stringify(localStorage));
  assert.ok(![secret, keys.adminKey, session.access_token, session.refresh_token].some(value => exposed.includes(value)), "Credential exposed in browser state");
  assert.ok(!build.logsContain([secret, keys.adminKey, fixturePassword, session.access_token, session.refresh_token]), "Credential entered server logs");
});

test("effective grants/default-deny RLS restrict even the service role to the pending-submit function", async () => {
  const roles = await query(`select role, has_table_privilege(role, 'public.client_access_requests', 'SELECT') as read,
    has_table_privilege(role, 'public.client_access_requests', 'INSERT') as create,
    has_table_privilege(role, 'public.client_access_requests', 'UPDATE') as change,
    has_table_privilege(role, 'public.client_access_requests', 'DELETE') as remove,
    has_function_privilege(role, 'public.submit_client_access_request(text,text,text,text,boolean)', 'EXECUTE') as submit
    from (values ('anon'), ('authenticated'), ('service_role')) as roles(role)`);
  for (const role of roles) assert.deepEqual(role, { role: role.role, read: false, create: false, change: false, remove: false, submit: role.role === "service_role" });
  const security = await query("select relrowsecurity as rls, (select count(*)::int from pg_policies where schemaname='public' and tablename='client_access_requests') as policies from pg_class where oid='public.client_access_requests'::regclass");
  assert.deepEqual(security, [{ rls: true, policies: 0 }]);
});

test("anon/authenticated REST callers cannot read, write, promote, delete or bypass the intake RPC", async () => {
  for (const accessToken of [undefined, session.access_token]) {
    const headers = { apikey: keys.publishableKey, "Content-Type": "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) };
    const record = body();
    delete record.website;
    for (const [method, payload] of [["GET", undefined], ["POST", { ...record, status: "pending" }], ["PATCH", { status: "approved" }], ["DELETE", undefined]]) {
      const result = await fetch(`${devUrl}/rest/v1/client_access_requests?email=eq.${encodeURIComponent(email)}`, { method, headers, ...(payload ? { body: JSON.stringify(payload) } : {}), redirect: "error" });
      assert.ok([401, 403, 404].includes(result.status), `${method} direct access returned unexpected HTTP ${result.status}`);
    }
    const result = await fetch(`${devUrl}/rest/v1/rpc/submit_client_access_request`, { method: "POST", headers,
      body: JSON.stringify({ p_name: "Synthetic Bypass", p_email: email, p_phone: "+44 7700 900123", p_company: null, p_contact_consent: true }), redirect: "error" });
    assert.ok([401, 403, 404].includes(result.status), "Ordinary client bypassed the server boundary");
  }
});

test("deployed Edge function rejects unauthenticated/public-key direct invocation", async () => {
  const result = await fetch(`${devUrl}/functions/v1/submit-access-request`, { method: "POST", headers: { apikey: keys.publishableKey, "Content-Type": "application/json" }, body: JSON.stringify(body()), redirect: "error" });
  assert.equal(result.status, 403);
});

test("CSRF, consent and injected status failures create no additional rows", async () => {
  assert.equal((await post(body(), { Origin: "null" })).status, 403);
  assert.equal((await post({ ...body(), contact_consent: false })).status, 400);
  assert.equal((await post({ ...body(), status: "active" })).status, 400);
  const rows = await query(`select count(*)::int as count from public.client_access_requests where email in (${literal(email)},${literal(existingEmail)},${literal(authOnlyEmail)}) and status = 'pending'`);
  assert.deepEqual(rows, [{ count: 1 }]);
});
