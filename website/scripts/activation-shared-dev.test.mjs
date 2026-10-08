import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test, { after, before } from "node:test";
import { chromium } from "playwright";
import { readDevKeys, devClient, devRef } from "./supabase-shared-dev.mjs";
import { invitationMarker } from "./invite-client-dev.mjs";
import { sessionTestBuild } from "./lib/session-test-build.mjs";

const namespace = randomUUID();
const fixtureMarker = "taxtrax-activation-isolated-test";
const firstPassword = `  ${randomBytes(24).toString("base64url")}Aa3!  `;
const users = [];
let keys;
let admin;
let build;
let origin;
let browser;
let context;
let page;
let hash;
let previousHash;
let setupSession;

before(async () => {
  keys = await readDevKeys();
  admin = devClient(keys.adminKey);
  for (const label of ["a", "b", "pending", "suspended", "missing"]) {
    const created = await admin.auth.admin.createUser({ email: `activation-${label}.${namespace}@taxtrax.example.invalid`, email_confirm: false,
      app_metadata: { taxtrax_client_invitation: invitationMarker, taxtrax_activation_test: fixtureMarker, namespace } });
    assert.ok(!created.error && created.data.user, "Isolated activation Auth fixture setup failed");
    users.push(created.data.user);
    if (label !== "missing") {
      const profile = await admin.from("client_profiles").insert({ user_id: created.data.user.id, name: `Synthetic Invited ${label.toUpperCase()}`,
        status: ["pending", "suspended"].includes(label) ? label : "active" });
      assert.ok(!profile.error, "Isolated profile setup failed");
    }
  }
  build = await sessionTestBuild([
    "lib/auth/request.ts", "lib/auth/handlers.ts", "lib/auth/activation.ts", "lib/validation.ts",
    "app/api/auth/login/route.ts", "app/api/auth/logout/route.ts", "app/portal/page.tsx", "components/portal/PortalClient.tsx",
    "components/portal/ActivationForm.tsx", "app/portal/activate/page.tsx",
    ...["callback", "verify", "password"].map(route => `app/api/auth/activation/${route}/route.ts`),
  ], { realPortal: true });
  origin = await build.start({ SUPABASE_URL: `https://${devRef}.supabase.co`, SUPABASE_PUBLISHABLE_KEY: keys.publishableKey }, { authOrigin: true });
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext();
  page = await context.newPage();
  for (const previous of [true, false]) {
    const generated = await admin.auth.admin.generateLink({ type: "invite", email: users[0].email });
    assert.ok(!generated.error && generated.data.properties?.hashed_token, "Synthetic provider invite proof setup failed");
    if (previous) previousHash = generated.data.properties.hashed_token;
    else hash = generated.data.properties.hashed_token;
  }
});

after(async () => {
  await browser?.close();
  await build?.stop();
  let failed = false;
  for (const user of users) {
    const verified = await admin.auth.admin.getUserById(user.id);
    if (verified.data.user?.app_metadata?.taxtrax_activation_test !== fixtureMarker || verified.data.user?.app_metadata?.namespace !== namespace) { failed = true; continue; }
    const removed = await admin.auth.admin.deleteUser(user.id);
    if (removed.error) failed = true;
  }
  assert.ok(!failed, "Isolated activation cleanup failed; owner inspection required. No other identity was deleted.");
});

function link(proof = hash) {
  return `${origin}/api/auth/activation/callback?token_hash=${proof}&type=invite`;
}
async function verifyPage(target) {
  const response = target.waitForResponse(result => new URL(result.url()).pathname === "/api/auth/activation/verify");
  await target.getByRole("button", { name: "Continue", exact: true }).click();
  return (await response).status();
}
async function profileRows(session) {
  const response = await fetch(`https://${devRef}.supabase.co/rest/v1/client_profiles?select=user_id,status`, {
    headers: { apikey: keys.publishableKey, Authorization: `Bearer ${session.access_token}` }, redirect: "error",
  });
  assert.equal(response.status, 200);
  return response.json();
}

test("first-time guidance remains non-interactive alongside the existing account-request UI", async () => {
  await page.goto(`${origin}/portal`);
  assert.equal(await page.getByText("First-time user? Use the invitation email from TaxTrax to set up your account.", { exact: true }).count(), 1);
  assert.equal(await page.getByRole("link", { name: /First-time user/ }).count(), 0);
  assert.equal(await page.getByRole("tab", { name: "Create account", exact: true }).count(), 1);
  const current = await admin.auth.admin.getUserById(users[0].id);
  assert.ok(!current.error && !current.data.user.email_confirmed_at);
});

test("replacement provider invitation invalidates the earlier unused proof", async () => {
  await page.goto(link(previousHash));
  assert.equal(await verifyPage(page), 401);
  assert.equal(await page.getByLabel("First password", { exact: true }).count(), 0);
});

test("invite callback works in a fresh browser; GET does not consume proof", async () => {
  await page.goto(link());
  assert.equal(page.url(), `${origin}/portal/activate`);
  await page.goto(link());
  assert.equal(await verifyPage(page), 200);
  await page.getByLabel("First password", { exact: true }).waitFor();
  const user = await admin.auth.admin.getUserById(users[0].id);
  assert.ok(!user.error && Boolean(user.data.user.email_confirmed_at));
  const cookies = await context.cookies();
  const family = `sb-${devRef}-auth-token-activation`;
  const chunks = cookies.filter(cookie => cookie.name === family || cookie.name.startsWith(`${family}.`)).sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }));
  assert.ok(chunks.length && chunks.every(cookie => cookie.httpOnly && cookie.sameSite === "Lax"));
  assert.ok(!cookies.some(cookie => cookie.name === `sb-${devRef}-auth-token` || cookie.name.startsWith(`sb-${devRef}-auth-token.`)));
  const encoded = decodeURIComponent(chunks.map(cookie => cookie.value).join(""));
  setupSession = JSON.parse(Buffer.from(encoded.slice(7), "base64url").toString("utf8"));
  const exposed = await page.evaluate(() => document.documentElement.innerHTML + document.cookie + JSON.stringify(localStorage) + JSON.stringify(sessionStorage));
  assert.ok(![hash, setupSession.access_token, setupSession.refresh_token, keys.adminKey].some(value => exposed.includes(value)), "Setup proof/credentials exposed to browser JavaScript or HTML");
  const rows = await profileRows(setupSession);
  assert.equal(rows.length, 1); assert.equal(rows[0].user_id, users[0].id); assert.equal(rows[0].status, "active");
});

test("verification does not authorize portal; refresh preserves setup without changing approval", async () => {
  await page.goto(`${origin}/portal`);
  assert.equal(await page.getByRole("heading", { name: "Client Portal Login", exact: true }).count(), 1);
  await page.goto(`${origin}/portal/activate`);
  await page.reload();
  await page.getByLabel("First password", { exact: true }).waitFor();
  const status = await page.evaluate(async () => (await fetch("/api/auth/activation/password", { method: "POST",
    headers: { "Content-Type": "application/json", "X-TaxTrax-Auth": "1" }, body: JSON.stringify({ password: "short1", confirm: "short1" }) })).status);
  assert.equal(status, 400);
  const rows = await profileRows(setupSession);
  assert.equal(rows[0].status, "active");
});

test("first password preserves bytes, revokes setup JWT and requires fresh password login", async () => {
  await page.getByLabel("First password", { exact: true }).fill(firstPassword);
  await page.getByLabel("Confirm password", { exact: true }).fill(firstPassword);
  const response = page.waitForResponse(result => new URL(result.url()).pathname === "/api/auth/activation/password");
  await page.getByRole("button", { name: "Set password", exact: true }).click();
  assert.equal((await response).status(), 200);
  await page.getByRole("heading", { name: "Client Portal Login", exact: true }).waitFor();
  assert.equal((await profileRows(setupSession)).length, 0);
  assert.ok(!(await context.cookies()).some(cookie => cookie.name.startsWith(`sb-${devRef}-auth-token-activation`) && cookie.value));
  await page.getByLabel("Email or username", { exact: true }).fill(users[0].email);
  await page.locator('input[name="password"]').fill(firstPassword);
  const signed = page.waitForResponse(result => new URL(result.url()).pathname === "/api/auth/login");
  await page.getByRole("button", { name: "Log In to Secure Portal", exact: true }).click();
  assert.equal((await signed).status(), 200);
  await page.getByRole("heading", { name: "Welcome, Synthetic Invited A", exact: true }).waitFor();
});

test("normal portal session cannot set first password and consumed invite fails closed", async () => {
  const status = await page.evaluate(async () => (await fetch("/api/auth/activation/password", { method: "POST",
    headers: { "Content-Type": "application/json", "X-TaxTrax-Auth": "1" }, body: JSON.stringify({ password: "Never-applied-password42", confirm: "Never-applied-password42" }) })).status);
  assert.equal(status, 401);
  const fresh = await browser.newContext();
  try { const target = await fresh.newPage(); await target.goto(link()); assert.equal(await verifyPage(target), 401); }
  finally { await fresh.close(); }
  assert.ok(!build.logsContain([hash, previousHash, firstPassword, keys.adminKey, setupSession.access_token, setupSession.refresh_token]), "Sensitive setup value entered server logs");
});

test("pending/suspended/missing profiles cannot self-approve through invitation verification", async () => {
  for (const status of ["pending", "suspended", "missing"]) {
    const user = users.find(item => item.email.startsWith(`activation-${status}.`));
    const generated = await admin.auth.admin.generateLink({ type: "invite", email: user.email });
    assert.ok(!generated.error && generated.data.properties?.hashed_token, "Isolated eligibility invite proof setup failed");
    const fresh = await browser.newContext();
    try {
      const target = await fresh.newPage(); await target.goto(link(generated.data.properties.hashed_token));
      assert.equal(await verifyPage(target), 401);
      assert.ok(!(await fresh.cookies()).some(cookie => cookie.name.startsWith(`sb-${devRef}-auth-token-activation`) && cookie.value));
    } finally { await fresh.close(); }
    const profile = await admin.from("client_profiles").select("status").eq("user_id", user.id).maybeSingle();
    assert.ok(!profile.error); assert.equal(profile.data?.status ?? "missing", status);
  }
});
