import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after, afterEach, before, beforeEach } from "node:test";
import { chromium } from "playwright";
import { fixturePassword, localFixtureContext, provisionFixtures, removeTestFixtures } from "./lib/supabase-fixtures.mjs";
import { sessionTestBuild } from "./lib/session-test-build.mjs";
import { authTestProxy } from "./lib/auth-test-proxy.mjs";

const namespace = randomUUID();
const spacedPassword = "  Synthetic portal Ée\u0301 password!  ";
const contexts = new Set();
const submissions = [];
let context;
let fixtures;
let build;
let proxy;
let browser;
let browserContext;
let page;
let origin;
let diagnostics = "";

function passwordFor(key) { return key === "active-b" ? spacedPassword : fixturePassword; }

async function newPage(viewport = { width: 1280, height: 900 }) {
  const current = await browser.newContext({ viewport });
  contexts.add(current);
  const target = await current.newPage();
  target.on("console", message => { diagnostics += message.text(); });
  target.on("request", request => {
    const path = new URL(request.url()).pathname;
    if (["/api/auth/login", "/api/auth/logout"].includes(path)) {
      submissions.push({ path, body: JSON.parse(request.postData()), customHeader: request.headers()["x-taxtrax-auth"], contentType: request.headers()["content-type"] });
    }
  });
  return { current, target };
}

async function loginUI(key = "active-a", { target = page, password = passwordFor(key), email = fixtures[key].email } = {}) {
  await target.goto(`${origin}/portal`);
  await target.getByRole("heading", { name: "Client Portal Login", exact: true }).waitFor();
  await target.getByLabel("Email or username", { exact: true }).fill(email);
  try { await target.locator('input[name="password"]').fill(password); }
  catch { throw new Error("Synthetic password field could not be filled."); }
  const posted = target.waitForResponse(response => new URL(response.url()).pathname === "/api/auth/login");
  await target.getByRole("button", { name: "Log In to Secure Portal", exact: true }).click();
  return (await posted).status();
}

async function dashboard(target = page, key = "active-a") {
  await target.getByRole("heading", { name: `Welcome, ${fixtures[key].profile.name}`, exact: true }).waitFor();
  assert.equal(await target.getByRole("heading", { name: "Client Portal Login", exact: true }).count(), 0);
}

async function loginScreen(target = page) {
  await target.getByRole("heading", { name: "Client Portal Login", exact: true }).waitFor();
  assert.equal(await target.getByRole("heading", { name: /^Welcome,/ }).count(), 0);
  assert.equal(await target.getByRole("heading", { name: "Recent documents", exact: true }).count(), 0);
}

async function logoutUI(target = page, mobile = false) {
  const posted = target.waitForResponse(response => new URL(response.url()).pathname === "/api/auth/logout");
  await target.getByRole("button", { name: mobile ? "Log out" : "← Log out", exact: true }).click();
  return (await posted).status();
}

async function revoke(session) {
  const result = await fetch(`${context.url}/auth/v1/logout?scope=local`, { method: "POST", headers: { apikey: context.publishableKey, Authorization: `Bearer ${session.access_token}` }, redirect: "error" });
  assert.ok(result.ok, "Synthetic session revocation setup failed");
}

async function profileRows(session) {
  const response = await fetch(`${context.url}/rest/v1/client_profiles?select=user_id`, { headers: { apikey: context.publishableKey, Authorization: `Bearer ${session.access_token}` }, redirect: "error" });
  assert.equal(response.status, 200);
  return response.json();
}

before(async () => {
  context = await localFixtureContext();
  fixtures = await provisionFixtures(context, namespace);
  const changed = await context.admin.auth.admin.updateUserById(fixtures["active-b"].id, { password: spacedPassword });
  assert.equal(changed.error, null, "Synthetic password fixture setup failed");
  proxy = await authTestProxy(context);
  build = await sessionTestBuild([
    "lib/auth/request.ts", "lib/auth/handlers.ts", "app/api/auth/login/route.ts", "app/api/auth/logout/route.ts",
    "app/portal/page.tsx", "components/portal/PortalClient.tsx",
  ], { realPortal: true });
  origin = await build.start({ SUPABASE_URL: proxy.url, SUPABASE_PUBLISHABLE_KEY: context.publishableKey }, { authOrigin: true });
  try { browser = await chromium.launch({ headless: true }); }
  catch { throw new Error("Chromium is unavailable; run the pinned local Playwright browser installation command."); }
});

beforeEach(async () => {
  const opened = await newPage();
  browserContext = opened.current;
  page = opened.target;
});

afterEach(async () => {
  proxy?.faults.clear();
  if (browserContext) { await browserContext.close(); contexts.delete(browserContext); }
});

after(async () => {
  for (const current of contexts) await current.close();
  await browser?.close();
  await build?.stop();
  await proxy?.stop();
  if (context) await removeTestFixtures(context, namespace);
});

test("anonymous HTTP GET renders the real login without authenticated dashboard data", async () => {
  const response = await fetch(`${origin}/portal`);
  assert.equal(response.status, 200);
  assert.ok(response.headers.get("Cache-Control").includes("private") && response.headers.get("Cache-Control").includes("no-store"));
  const html = await response.text();
  assert.ok(html.includes("Client Portal Login"));
  for (const text of ["Welcome,", "W-2_2026.pdf", fixtures["active-a"].profile.name, fixtures["active-b"].profile.name]) assert.ok(!html.includes(text));
});

test("existing login UI authenticates and displays only the server-verified profile name", async () => {
  assert.equal(await loginUI("active-a", { email: `  ${fixtures["active-a"].email.toUpperCase()}  ` }), 200);
  await dashboard();
  assert.equal(new URL(page.url()).pathname, "/portal");
  assert.equal(new URL(page.url()).search, "");
  assert.ok(!(await page.getByRole("heading", { name: /^Welcome,/ }).textContent()).includes(fixtures["active-a"].email));
});

test("authenticated refresh re-evaluates and preserves authorized portal access", async () => {
  assert.equal(await loginUI(), 200);
  await dashboard();
  const refreshed = await page.reload();
  assert.ok(refreshed.headers()["cache-control"].includes("no-store"));
  await dashboard();
});

for (const [label, email, password] of [
  ["wrong password", () => fixtures["active-a"].email, "Synthetic-wrong-password!"],
  ["unknown email", () => `absent.${namespace}@taxtrax.example.invalid`, fixturePassword],
]) {
  test(`${label} stays on login with identical generic feedback`, async () => {
    assert.equal(await loginUI("active-a", { email: email(), password }), 401);
    await loginScreen();
    await page.locator('main#main p[role="alert"]').waitFor();
    assert.equal(await page.locator('main#main p[role="alert"]').textContent(), "Unable to sign in.");
  });
}

for (const key of ["pending", "suspended", "no-profile", "unconfirmed"]) {
  test(`${key} cannot reach the dashboard through UI or fresh navigation`, async () => {
    assert.equal(await loginUI(key), 401);
    await loginScreen();
    await page.locator('main#main p[role="alert"]').waitFor();
    assert.equal(await page.locator('main#main p[role="alert"]').textContent(), "Unable to sign in.");
    await page.goto(`${origin}/portal`);
    await loginScreen();
  });
}

test("forged HttpOnly session cookie never renders the dashboard", async () => {
  assert.equal(await loginUI(), 200);
  await dashboard();
  const session = proxy.sessions.at(-1);
  const parts = session.access_token.split(".");
  const forged = { ...session, access_token: `${parts[0]}.${parts[1]}.invalid_signature` };
  const value = `base64-${Buffer.from(JSON.stringify(forged)).toString("base64url")}`;
  await browserContext.clearCookies();
  try { await browserContext.addCookies([{ name: "sb-127-auth-token", value, url: origin, httpOnly: true, secure: true, sameSite: "Lax" }]); }
  catch { throw new Error("Synthetic forged-cookie setup failed."); }
  await page.goto(`${origin}/portal`);
  await loginScreen();
});

test("revoked otherwise-unexpired session cannot render the dashboard on refresh", async () => {
  assert.equal(await loginUI(), 200);
  await dashboard();
  const session = proxy.sessions.at(-1);
  assert.ok(session.expires_at > Date.now() / 1000);
  await revoke(session);
  await page.reload();
  await loginScreen();
  assert.deepEqual(await profileRows(session), []);
});

test("desktop logout sends the exact contract and returns to server-rendered login", async () => {
  assert.equal(await loginUI(), 200);
  await dashboard();
  assert.equal(await page.getByRole("button", { name: "← Log out", exact: true }).isVisible(), true);
  assert.equal(await page.getByRole("button", { name: "Log out", exact: true }).isVisible(), false);
  assert.equal(await logoutUI(), 200);
  await loginScreen();
  const submission = submissions.at(-1);
  assert.equal(submission.path, "/api/auth/logout");
  assert.equal(Object.keys(submission.body).length, 0);
  assert.equal(submission.customHeader, "1");
  assert.equal(submission.contentType, "application/json");
  assert.equal((await browserContext.cookies()).filter(cookie => cookie.name.startsWith("sb-127-auth-token")).length, 0);
});

test("mobile logout uses the same backend and returns to login", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await loginUI(), 200);
  await dashboard();
  assert.equal(await page.getByRole("button", { name: "Log out", exact: true }).isVisible(), true);
  assert.equal(await page.locator("aside").isVisible(), false);
  assert.equal(await logoutUI(page, true), 200);
  await loginScreen();
});

test("back history and refresh after logout cannot restore authenticated portal access", async () => {
  assert.equal(await loginUI(), 200);
  await dashboard();
  await page.goto(`${origin}/outside`);
  await page.goto(`${origin}/portal`);
  await dashboard();
  assert.equal(await logoutUI(), 200);
  await loginScreen();
  await page.goBack();
  assert.equal(new URL(page.url()).pathname, "/outside");
  await page.goBack().catch(error => { if (!error.message.includes("ERR_ABORTED")) throw new Error("Portal back navigation failed."); });
  await loginScreen();
  await page.reload();
  await loginScreen();
});

test("persisted browser history restoration explicitly revalidates server authorization", async () => {
  assert.equal(await loginUI(), 200);
  await dashboard();
  await revoke(proxy.sessions.at(-1));
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
  await loginScreen();
});

test("independent browser session remains authorized after another device logs out", async () => {
  assert.equal(await loginUI(), 200);
  await dashboard();
  const extra = await newPage();
  try {
    assert.equal(await loginUI("active-a", { target: extra.target }), 200);
    await dashboard(extra.target);
    assert.equal(await logoutUI(), 200);
    await loginScreen();
    await extra.target.reload();
    await dashboard(extra.target);
  } finally { await extra.current.close(); contexts.delete(extra.current); }
});

test("tokens are absent from browser JavaScript storage, rendered HTML and client bundles", async () => {
  assert.equal(await loginUI(), 200);
  await dashboard();
  const visible = await page.evaluate(() => ({ cookies: document.cookie, local: JSON.stringify({ ...localStorage }), session: JSON.stringify({ ...sessionStorage }) }));
  assert.ok(!visible.cookies.includes("sb-127-auth-token"));
  const html = await page.content();
  for (const session of proxy.sessions) {
    for (const token of [session.access_token, session.refresh_token]) assert.ok(!html.includes(token) && !JSON.stringify(visible).includes(token), "Session tokens must remain unavailable to browser JavaScript/HTML");
  }
  assert.ok(!html.includes(fixtures["active-a"].id), "Only the needed profile name is serialized to presentation");
  const authCookies = (await browserContext.cookies()).filter(cookie => cookie.name.startsWith("sb-127-auth-token"));
  assert.ok(authCookies.length > 0 && authCookies.every(cookie => cookie.httpOnly && cookie.secure && cookie.sameSite === "Lax"));
  const scripts = await page.locator("script[src]").evaluateAll(elements => elements.map(element => element.src));
  for (const url of scripts) {
    const source = await (await fetch(url)).text();
    assert.ok(!source.includes("createBrowserClient") && !source.includes("sb_publishable_") && !source.includes("sb_secret_"), "Server SDK/configuration must not enter browser chunks");
  }
});

test("Remember me is disabled and even forced DOM changes do not alter the credential contract", async () => {
  await page.goto(`${origin}/portal`);
  const checkbox = page.getByRole("checkbox", { name: "Remember me (not available yet)", exact: true });
  assert.equal(await checkbox.isDisabled(), true);
  assert.equal(await checkbox.isChecked(), false);
  await checkbox.evaluate(element => { element.disabled = false; element.checked = true; });
  await page.getByLabel("Email or username", { exact: true }).fill(fixtures["active-b"].email);
  try { await page.locator('input[name="password"]').fill(spacedPassword); }
  catch { throw new Error("Synthetic password field could not be filled."); }
  const posted = page.waitForResponse(response => new URL(response.url()).pathname === "/api/auth/login");
  await page.getByRole("button", { name: "Log In to Secure Portal", exact: true }).click();
  assert.equal((await posted).status(), 200);
  await dashboard(page, "active-b");
  const submission = submissions.at(-1);
  assert.deepEqual(Object.keys(submission.body).sort(), ["email", "password"]);
  assert.ok(submission.body.password === spacedPassword, "Password bytes must be preserved by UI wiring");
  assert.equal(submission.customHeader, "1");
});

test("login layout, password toggle and deferred activation/recovery controls remain intact", async () => {
  await page.goto(`${origin}/portal`);
  await loginScreen();
  const brand = page.getByText("Your financial data is fully encrypted and secure.", { exact: true });
  const form = page.locator("form");
  const brandBounds = await brand.boundingBox();
  const formBounds = await form.boundingBox();
  assert.ok(brandBounds.x < formBounds.x, "Desktop brand/form columns must be preserved");
  for (const label of ["256-bit SSL Encryption", "SOC 2 Type II", "IRS e-File Standard"]) assert.equal(await page.getByText(label, { exact: true }).isVisible(), true);
  await page.getByRole("button", { name: "Show", exact: true }).click();
  assert.equal(await page.locator('input[name="password"]').getAttribute("type"), "text");
  await page.getByRole("button", { name: "Hide", exact: true }).click();
  assert.equal(await page.locator('input[name="password"]').getAttribute("type"), "password");
  const before = submissions.length;
  for (const name of ["Forgot password?", "First-time user? Activate your account"]) {
    const link = page.getByRole("link", { name, exact: true });
    assert.equal(await link.getAttribute("aria-disabled"), "true");
    await link.click({ force: true });
    assert.equal(page.url(), `${origin}/portal`);
  }
  assert.equal(submissions.length, before);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok((await brand.boundingBox()).y < (await form.boundingBox()).y, "Mobile brand/form stacking must remain intact");
});

test("unrelated dashboard mock data, navigation and copy remain unchanged", async () => {
  assert.equal(await loginUI(), 200);
  await dashboard();
  for (const text of ["2025 · In progress", "Pending tasks", "Documents awaiting review", "W-2_2026.pdf", "1099-INT.pdf", "Business_Expenses.xlsx", "Upload 2025 W-2 / salary certificate", "Review & sign engagement letter", "Review draft return & e-sign", "No upcoming appointments."]) {
    assert.equal(await page.getByText(text, { exact: true }).isVisible(), true);
  }
  await page.getByRole("button", { name: "Documents", exact: true }).click();
  assert.equal(await page.getByText("Documents — connects to the backend once the client data model and storage are wired up.", { exact: true }).isVisible(), true);
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  assert.equal(await page.getByRole("heading", { name: "Your checklist", exact: true }).isVisible(), true);
});

test("profile/provider infrastructure failures never render authenticated content", async () => {
  assert.equal(await loginUI(), 200);
  await dashboard();
  proxy.faults.set("/rest/v1/client_profiles", 503);
  await page.reload();
  await page.getByRole("heading", { name: "Client Portal Unavailable", exact: true }).waitFor();
  assert.equal(await page.getByRole("heading", { name: /^Welcome,/ }).count(), 0);
  assert.ok((await page.locator('main#main p[role="alert"]').textContent()).includes("temporarily unavailable"));
  proxy.faults.clear();
  proxy.faults.set("/auth/v1/user", 503);
  const response = await page.reload();
  assert.equal(response.status(), 503);
  assert.ok((await page.locator("body").textContent()).includes("temporarily unavailable"));
  assert.ok(!(await page.content()).includes("Welcome,"));
});

test("login provider failure shows sanitized feedback without dashboard content", async () => {
  proxy.faults.set("/auth/v1/token", 503);
  assert.equal(await loginUI(), 503);
  await loginScreen();
  await page.locator('main#main p[role="alert"]').waitFor();
  assert.equal(await page.locator('main#main p[role="alert"]').textContent(), "Unable to sign in right now. Please try again.");
});

test("failed provider logout revalidates cleared cookies without pretending revocation succeeded", async () => {
  assert.equal(await loginUI(), 200);
  await dashboard();
  const session = proxy.sessions.at(-1);
  proxy.faults.set("/auth/v1/logout", 503);
  assert.equal(await logoutUI(), 503);
  await loginScreen();
  await page.locator('main#main p[role="alert"]').waitFor();
  assert.equal(await page.locator('main#main p[role="alert"]').textContent(), "Unable to confirm sign-out. Please try again.");
  assert.equal((await browserContext.cookies()).filter(cookie => cookie.name.startsWith("sb-127-auth-token")).length, 0);
  assert.equal((await profileRows(session)).length, 1, "Provider failure must not be described as confirmed remote revocation");
  proxy.faults.clear();
  await revoke(session);
});

test("duplicate form submission is blocked while a credential request is pending", async () => {
  await page.goto(`${origin}/portal`);
  await page.getByLabel("Email or username", { exact: true }).fill(fixtures["active-a"].email);
  try { await page.locator('input[name="password"]').fill(fixturePassword); }
  catch { throw new Error("Synthetic password field could not be filled."); }
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let intercepted = 0;
  await page.route("**/api/auth/login", async route => { intercepted++; await gate; await route.continue(); });
  try {
    await page.getByRole("button", { name: "Log In to Secure Portal", exact: true }).click();
    assert.equal(await page.getByRole("button", { name: "Signing in…", exact: true }).isDisabled(), true);
    await page.locator("form").evaluate(element => {
      element.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      element.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    assert.equal(intercepted, 1);
  } finally { release(); }
  await dashboard();
});

test("display-only logout query flag cannot authorize an anonymous client", async () => {
  await page.goto(`${origin}/portal?logout=unconfirmed&user_id=${fixtures["active-a"].id}&role=admin`);
  await loginScreen();
  assert.equal(await page.locator('main#main p[role="alert"]').textContent(), "Unable to confirm sign-out. Please try again.");
});

test("application/browser diagnostics contain no passwords or provider session tokens", () => {
  const sensitive = [fixturePassword, spacedPassword, ...proxy.sessions.flatMap(session => [session.access_token, session.refresh_token])];
  assert.equal(build.logsContain(sensitive), false);
  assert.ok(!sensitive.some(value => diagnostics.includes(value)));
});
