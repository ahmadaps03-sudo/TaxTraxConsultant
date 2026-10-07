import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test, { after, before } from "node:test";
import { chromium } from "playwright";
import { readDevKeys, devClient, devRef } from "./supabase-shared-dev.mjs";
import { sessionTestBuild } from "./lib/session-test-build.mjs";

const namespace = randomUUID();
const marker = "taxtrax-recovery-isolated-test";
const fixturePassword = `${randomBytes(32).toString("base64url")}Aa1!`;
const nextPassword = `  ${randomBytes(24).toString("base64url")}Aa2!  `;
const users = [];
const sessions = [];
let keys;
let admin;
let build;
let origin;
let browser;
let current;
let page;
let recoveryHash;
let oldSession;
let otherSession;

before(async () => {
  keys = await readDevKeys();
  admin = devClient(keys.adminKey);
  for (const label of ["a", "b"]) {
    const email = `recovery-${label}.${namespace}@taxtrax.example.invalid`;
    const created = await admin.auth.admin.createUser({ email, password: fixturePassword, email_confirm: true, app_metadata: { taxtrax_recovery_test: marker, namespace } });
    assert.ok(!created.error && created.data.user, "Isolated synthetic Auth fixture setup failed");
    users.push(created.data.user);
    const profile = await admin.from("client_profiles").insert({ user_id: created.data.user.id, name: `Synthetic Recovery ${label.toUpperCase()}`, status: "active" });
    assert.ok(!profile.error, "Isolated synthetic profile setup failed");
  }
  for (const user of users) {
    const client = devClient(keys.publishableKey);
    const signed = await client.auth.signInWithPassword({ email: user.email, password: fixturePassword });
    assert.ok(!signed.error && signed.data.session, "Synthetic independent session setup failed");
    sessions.push(client);
    if (user === users[0]) oldSession = signed.data.session;
    else otherSession = signed.data.session;
  }
  build = await sessionTestBuild([
    "lib/auth/request.ts", "lib/auth/handlers.ts", "lib/auth/recovery.ts", "lib/validation.ts",
    "app/api/auth/login/route.ts", "app/api/auth/logout/route.ts", "app/portal/page.tsx", "components/portal/PortalClient.tsx",
    "components/portal/RecoveryForm.tsx", "app/portal/forgot-password/page.tsx", "app/portal/reset-password/page.tsx",
    ...["request", "callback", "verify", "password"].map(route => `app/api/auth/recovery/${route}/route.ts`),
  ], { realPortal: true });
  origin = await build.start({ SUPABASE_URL: `https://${devRef}.supabase.co`, SUPABASE_PUBLISHABLE_KEY: keys.publishableKey }, { authOrigin: true });
  browser = await chromium.launch({ headless: true });
  current = await browser.newContext();
  page = await current.newPage();
  const generated = await admin.auth.admin.generateLink({ type: "recovery", email: users[0].email });
  assert.ok(!generated.error && generated.data.properties?.hashed_token, "Synthetic provider recovery proof setup failed");
  recoveryHash = generated.data.properties.hashed_token;
});

after(async () => {
  let failed = false;
  for (const session of sessions) await session.auth.signOut({ scope: "local" }).catch(() => {});
  await browser?.close();
  await build?.stop();
  for (const user of users) {
    const verified = await admin.auth.admin.getUserById(user.id);
    if (verified.data.user?.app_metadata?.taxtrax_recovery_test !== marker || verified.data.user?.app_metadata?.namespace !== namespace) { failed = true; continue; }
    const removed = await admin.auth.admin.deleteUser(user.id);
    if (removed.error) failed = true;
  }
  assert.ok(!failed, "Isolated synthetic cleanup failed; owner inspection required. No other identity was deleted.");
});

function link(hash = recoveryHash) {
  return `${origin}/api/auth/recovery/callback?token_hash=${hash}&type=recovery`;
}

async function rows(session, userId) {
  const url = new URL(`https://${devRef}.supabase.co/rest/v1/client_profiles`);
  url.searchParams.set("select", "user_id");
  if (userId) url.searchParams.set("user_id", `eq.${userId}`);
  const response = await fetch(url, { headers: { apikey: keys.publishableKey, Authorization: `Bearer ${session.access_token}` }, redirect: "error" });
  assert.equal(response.status, 200);
  return response.json();
}

test("anonymous UI exposes recovery action without changing login protection", async () => {
  await page.goto(`${origin}/portal`);
  assert.equal(await page.getByRole("heading", { name: "Client Portal Login", exact: true }).count(), 1);
  await page.getByRole("link", { name: "Forgot password?", exact: true }).click();
  await page.getByRole("heading", { name: "Forgot password?", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Send recovery email", exact: true }).isEnabled(), true);
});

test("callback works in a new browser with no requester PKCE state; GET does not consume proof", async () => {
  await page.goto(link());
  assert.equal(page.url(), `${origin}/portal/reset-password`);
  assert.equal(await page.getByRole("button", { name: "Continue", exact: true }).isEnabled(), true);
  await page.goto(link());
  const response = page.waitForResponse(result => new URL(result.url()).pathname === "/api/auth/recovery/verify");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  assert.equal((await response).status(), 200);
  await page.getByLabel("New password", { exact: true }).waitFor();
  const cookies = await current.cookies();
  assert.ok(cookies.filter(cookie => cookie.name.includes("-recovery")).every(cookie => cookie.httpOnly && cookie.sameSite === "Lax"));
  assert.ok(!cookies.some(cookie => cookie.name === `sb-${devRef}-auth-token` || cookie.name.startsWith(`sb-${devRef}-auth-token.`)));
  const chunks = cookies.filter(cookie => cookie.name.startsWith(`sb-${devRef}-auth-token-recovery`)).sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }));
  const encoded = decodeURIComponent(chunks.map(cookie => cookie.value).join(""));
  const session = JSON.parse(Buffer.from(encoded.slice(7), "base64url").toString("utf8"));
  const exposed = await page.evaluate(() => document.documentElement.innerHTML + document.cookie + JSON.stringify(localStorage) + JSON.stringify(sessionStorage));
  assert.ok(!exposed.includes(session.access_token) && !exposed.includes(session.refresh_token), "Recovery session tokens exposed to browser JavaScript/HTML");
});

test("recovery session cannot authorize portal and refresh preserves the reset form", async () => {
  await page.goto(`${origin}/portal`);
  assert.equal(await page.getByRole("heading", { name: "Client Portal Login", exact: true }).count(), 1);
  await page.goto(`${origin}/portal/reset-password`);
  await page.getByLabel("New password", { exact: true }).waitFor();
  await page.reload();
  await page.getByLabel("New password", { exact: true }).waitFor();
  const exposed = await page.evaluate(() => document.documentElement.innerHTML + document.cookie + JSON.stringify(localStorage) + JSON.stringify(sessionStorage));
  for (const secret of [recoveryHash, fixturePassword, keys.adminKey, oldSession.access_token, oldSession.refresh_token]) assert.ok(!exposed.includes(secret), "Sensitive value exposed to browser JavaScript/HTML");
});

test("weak password can be corrected without consuming another recovery link", async () => {
  const status = await page.evaluate(async () => {
    const result = await fetch("/api/auth/recovery/password", { method: "POST", headers: { "Content-Type": "application/json", "X-TaxTrax-Auth": "1" }, body: JSON.stringify({ password: "short1", confirm: "short1" }) });
    return result.status;
  });
  assert.equal(status, 400);
});

test("reset preserves password bytes, revokes all target-user sessions and leaves another client isolated", async () => {
  await page.getByLabel("New password", { exact: true }).fill(nextPassword);
  await page.getByLabel("Confirm new password", { exact: true }).fill(nextPassword);
  const response = page.waitForResponse(result => new URL(result.url()).pathname === "/api/auth/recovery/password");
  await page.getByRole("button", { name: "Update password", exact: true }).click();
  assert.equal((await response).status(), 200);
  await page.getByRole("heading", { name: "Client Portal Login", exact: true }).waitFor();
  assert.equal((await rows(oldSession)).length, 0);
  assert.equal((await rows(otherSession, users[1].id)).length, 1);
  assert.equal((await rows(otherSession, users[0].id)).length, 0);
  const oldLogin = await devClient(keys.publishableKey).auth.signInWithPassword({ email: users[0].email, password: fixturePassword });
  assert.ok(Boolean(oldLogin.error), "Old password must fail after reset");
  await page.getByLabel("Email or username", { exact: true }).fill(users[0].email);
  await page.locator('input[name="password"]').fill(nextPassword);
  const signed = page.waitForResponse(result => new URL(result.url()).pathname === "/api/auth/login");
  await page.getByRole("button", { name: "Log In to Secure Portal", exact: true }).click();
  assert.equal((await signed).status(), 200);
  await page.getByRole("heading", { name: "Welcome, Synthetic Recovery A", exact: true }).waitFor();
});

test("used/invalid links fail closed; normal portal cookies cannot update password", async () => {
  const status = await page.evaluate(async () => {
    const result = await fetch("/api/auth/recovery/password", { method: "POST", headers: { "Content-Type": "application/json", "X-TaxTrax-Auth": "1" }, body: JSON.stringify({ password: "Never-applied-password23", confirm: "Never-applied-password23" }) });
    return result.status;
  });
  assert.equal(status, 401);
  await page.goto(link());
  const response = page.waitForResponse(result => new URL(result.url()).pathname === "/api/auth/recovery/verify");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  assert.equal((await response).status(), 401);
  await page.locator('p[role="alert"]').waitFor();
  assert.equal(await page.getByLabel("New password", { exact: true }).count(), 0);
  await page.goto(link("malformed"));
  assert.equal(await page.getByRole("button", { name: "Continue", exact: true }).isDisabled(), true);
});

test("ordinary login/logout security still holds after recovery", async () => {
  await page.goto(`${origin}/portal`);
  await page.getByRole("heading", { name: "Welcome, Synthetic Recovery A", exact: true }).waitFor();
  const response = page.waitForResponse(result => new URL(result.url()).pathname === "/api/auth/logout");
  await page.getByRole("button", { name: "← Log out", exact: true }).click();
  assert.equal((await response).status(), 200);
  await page.getByRole("heading", { name: "Client Portal Login", exact: true }).waitFor();
  await page.reload();
  assert.equal(await page.getByRole("heading", { name: /^Welcome,/ }).count(), 0);
  assert.equal((await rows(otherSession, users[1].id)).length, 1);
  assert.ok(!build.logsContain([recoveryHash, fixturePassword, nextPassword, keys.adminKey, oldSession.access_token, oldSession.refresh_token]), "Sensitive value entered application logs");
});

test("pending/suspended/missing profiles cannot establish a usable reset browser session", async () => {
  for (const status of ["pending", "suspended", "missing"]) {
    const changed = status === "missing" ? await admin.from("client_profiles").delete().eq("user_id", users[0].id)
      : await admin.from("client_profiles").update({ status }).eq("user_id", users[0].id);
    assert.ok(!changed.error, "Isolated eligibility fixture setup failed");
    const generated = await admin.auth.admin.generateLink({ type: "recovery", email: users[0].email });
    assert.ok(!generated.error && generated.data.properties?.hashed_token, "Isolated eligibility proof setup failed");
    const fresh = await browser.newContext();
    try {
      const target = await fresh.newPage();
      await target.goto(link(generated.data.properties.hashed_token));
      const response = target.waitForResponse(result => new URL(result.url()).pathname === "/api/auth/recovery/verify");
      await target.getByRole("button", { name: "Continue", exact: true }).click();
      assert.equal((await response).status(), 401);
      const cookies = await fresh.cookies();
      assert.ok(!cookies.some(cookie => cookie.name.startsWith(`sb-${devRef}-auth-token-recovery`) && cookie.value), "Ineligible reset committed browser auth state");
      assert.equal(await target.getByLabel("New password", { exact: true }).count(), 0);
    } finally { await fresh.close(); }
  }
});
