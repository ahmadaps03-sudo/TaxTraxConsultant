import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { normalizeAccessRequest, submitAccessRequest } from "../../supabase/functions/submit-access-request/core.mjs";
import { accessRequestEnvironment } from "./setup-access-requests-dev.mjs";
import { sessionTestBuild } from "./lib/session-test-build.mjs";

const secret = "synthetic_scoped_submission_capability_1234567890";
const origin = "http://localhost:3000";
const input = { name: " Synthetic Requester ", email: " REQUEST@example.invalid ", phone: " +44 7700 900123 ", company: " Synthetic Company ", contact_consent: true, website: "" };

test("existing-account filtering stays inside the service-only void database function", async () => {
  const migration = await readFile(new URL("../../supabase/migrations/20261008000200_access_request_existing_accounts.sql", import.meta.url), "utf8");
  assert.match(migration, /returns void\s+language plpgsql\s+security definer\s+set search_path = ''/);
  assert.match(migration, /where not exists \(\s+select 1 from auth\.users\s+where lower\(btrim\(email\)\) = lower\(btrim\(p_email\)\)/);
  assert.match(migration, /on conflict \(email\) do nothing/);
  assert.match(migration, /owner to postgres/);
  assert.match(migration, /revoke all on function [^;]+ from public, anon, authenticated, service_role/);
  assert.match(migration, /grant execute on function [^;]+ to service_role/);
  assert.doesNotMatch(migration, /\b(?:update|delete)\s|insert into (?:auth\.users|public\.client_profiles)/i);
});

test("normalization includes real consent and nullable company, with no identity/approval fields", () => {
  assert.deepEqual(normalizeAccessRequest(input).value, { name: "Synthetic Requester", email: "request@example.invalid", phone: "+44 7700 900123", company: "Synthetic Company", contact_consent: true });
  assert.equal(normalizeAccessRequest({ ...input, company: "  " }).value.company, null);
  for (const key of ["status", "user_id", "role", "password", "redirect", "approved"]) assert.throws(() => normalizeAccessRequest({ ...input, [key]: "untrusted" }));
  for (const value of [null, [], "invalid", {}]) assert.throws(() => normalizeAccessRequest(value));
});

test("all fields reject unsafe types, controls, invalid shape and excess length", () => {
  for (const [field, values] of Object.entries({ name: [null, "a", "a".repeat(101), "Synthetic\nRequester"], email: ["bad", "a@b", "a".repeat(65) + "@example.invalid", "request\n@example.invalid"],
    phone: ["1234", "a".repeat(41), "1234567890123456", "+44<script>"], company: [false, "a".repeat(101), "bad\tvalue"], contact_consent: [false, "true", null], website: [false, "a".repeat(101)] })) {
    for (const value of values) assert.ok(normalizeAccessRequest({ ...input, [field]: value }).fields, `Invalid ${field} was accepted`);
  }
});

const edgeRequest = (body = input, headers = {}, method = "POST") => new Request("https://synthetic.example.invalid/submit", {
  method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}`, ...headers }, ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
});

test("Edge intake requires the scoped capability; public keys and CORS do not grant access", async () => {
  let writes = 0;
  for (const value of ["", "sb_publishable_synthetic", secret.replace("123", "456")]) {
    const result = await submitAccessRequest(edgeRequest(input, { Authorization: `Bearer ${value}` }), { secret }, async () => writes++);
    assert.equal(result.status, 403); assert.ok(!(await result.text()).includes(secret));
    assert.equal(result.headers.get("access-control-allow-origin"), null);
  }
  assert.equal((await submitAccessRequest(edgeRequest(), {}, async () => writes++)).status, 503);
  assert.equal((await submitAccessRequest(edgeRequest(input, {}, "GET"), { secret }, async () => writes++)).status, 405);
  assert.equal(writes, 0);
});

test("Edge intake is bounded, rejects malformed input and sends normalized pending-only data", async () => {
  let written;
  assert.equal((await submitAccessRequest(edgeRequest(input, { "Content-Type": "text/plain" }), { secret }, async () => {})).status, 415);
  assert.equal((await submitAccessRequest(edgeRequest(input, { "Content-Length": "5000" }), { secret }, async () => {})).status, 413);
  const malformed = edgeRequest();
  const malformedResult = await submitAccessRequest(new Request(malformed.url, { method: "POST", headers: malformed.headers, body: "{" }), { secret }, async () => {});
  assert.equal(malformedResult.status, 400);
  const result = await submitAccessRequest(edgeRequest(), { secret }, async value => { written = value; });
  assert.equal(result.status, 200); assert.deepEqual(await result.json(), { ok: true });
  assert.deepEqual(written, normalizeAccessRequest(input).value);
  assert.equal(result.headers.get("cache-control"), "private, no-store");
});

test("Edge honeypot creates nothing; storage failures expose neither provider errors nor credentials", async () => {
  let writes = 0;
  assert.equal((await submitAccessRequest(edgeRequest({ ...input, website: "bot" }), { secret }, async () => writes++)).status, 200);
  assert.equal(writes, 0);
  const failed = await submitAccessRequest(edgeRequest(), { secret }, async () => { throw new Error(`private SQL ${secret}`); });
  assert.equal(failed.status, 503); assert.ok(!(await failed.text()).includes(secret));
});

test("owner setup preserves unrelated environment and never accepts another project", () => {
  const content = 'SUPABASE_URL=https://dbcakdqthnamgjfkkxzn.supabase.co\r\nADMIN_API_KEY=synthetic-unrelated\r\n';
  const updated = accessRequestEnvironment(content, secret);
  assert.ok(updated.startsWith(content)); assert.equal(accessRequestEnvironment(updated, secret), updated);
  assert.ok(!updated.includes("service_role"));
  assert.throws(() => accessRequestEnvironment(content.replace("dbcakdqthnamgjfkkxzn", "another-project"), secret));
  assert.throws(() => accessRequestEnvironment(updated + `ACCESS_REQUEST_SUBMISSION_SECRET=${secret}\n`, secret));
});

let build;
let handler;
let oldEnvironment;
let originalFetch;
let address = 0;
let calls = [];
before(async () => {
  oldEnvironment = Object.fromEntries(["AUTH_ORIGIN", "SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "ACCESS_REQUEST_SUBMISSION_SECRET", "TRUST_PROXY"].map(key => [key, process.env[key]]));
  Object.assign(process.env, { AUTH_ORIGIN: origin, SUPABASE_URL: "https://dbcakdqthnamgjfkkxzn.supabase.co", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic", ACCESS_REQUEST_SUBMISSION_SECRET: secret, TRUST_PROXY: "1" });
  build = await sessionTestBuild(["lib/access-requests/handler.ts", "lib/auth/request.ts"]);
  handler = build.require("lib/access-requests/handler.js").requestPortalAccess;
  originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => { calls.push({ url, options }); return new Response('{"ok":true}', { headers: { "Content-Type": "application/json" } }); };
});
after(async () => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(oldEnvironment ?? {})) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  await build?.stop();
});
function request(body = input, headers = {}, raw) {
  return new Request(`${origin}/api/portal/access-requests`, { method: "POST", headers: {
    Origin: origin, "Content-Type": "application/json", "X-TaxTrax-Auth": "1", "X-Forwarded-For": `127.0.0.${++address}`, ...headers,
  }, body: raw ?? JSON.stringify(body) });
}

test("Next.js enforces exact origin/custom header/metadata/content type before provider calls", async () => {
  calls = [];
  for (const headers of [{ Origin: "" }, { Origin: "null" }, { Origin: "http://localhost:3001" }, { Origin: "https://localhost:3000" },
    { "X-TaxTrax-Auth": "" }, { "Sec-Fetch-Site": "cross-site" }, { "Sec-Fetch-Mode": "navigate" }, { "Sec-Fetch-Dest": "document" }]) {
    assert.equal((await handler(request(input, headers))).status, 403);
  }
  assert.equal((await handler(request(input, { "Content-Type": "text/plain" }))).status, 415);
  assert.equal(calls.length, 0);
});

test("Next.js bounds bodies, handles malformed JSON and rejects security-sensitive extra fields", async () => {
  calls = [];
  assert.equal((await handler(request(input, {}, "{"))).status, 400);
  assert.equal((await handler(request(input, {}, " ".repeat(5000)))).status, 413);
  for (const key of ["status", "user_id", "password", "redirect", "approved"]) assert.equal((await handler(request({ ...input, [key]: "untrusted" }))).status, 400);
  const denied = await handler(request({ ...input, contact_consent: false }));
  assert.equal(denied.status, 400); assert.ok((await denied.json()).fields.agree);
  assert.equal(calls.length, 0);
});

test("Next.js forwards only normalized intake via a scoped server-only credential", async () => {
  calls = [];
  const result = await handler(request(input, { Cookie: "sb-synthetic=private-cookie" }));
  assert.equal(result.status, 200); assert.deepEqual(await result.json(), { ok: true });
  assert.ok(result.headers.get("cache-control").includes("no-store")); assert.equal(result.headers.get("set-cookie"), null);
  assert.equal(calls.length, 1); assert.ok(calls[0].url.endsWith("/functions/v1/submit-access-request"));
  assert.equal(calls[0].options.headers.Authorization, `Bearer ${secret}`);
  assert.equal(calls[0].options.headers.Cookie, undefined);
  const posted = JSON.parse(calls[0].options.body);
  assert.equal(posted.contact_consent, true); assert.equal(posted.email, "request@example.invalid");
  assert.deepEqual(Object.keys(posted).sort(), Object.keys(input).sort());
});

test("normal Create account form data leaves the neutral honeypot empty", async () => {
  const portal = await sessionTestBuild(["app/portal/page.tsx", "components/portal/PortalClient.tsx"], { realPortal: true });
  const mockedFetch = globalThis.fetch;
  globalThis.fetch = originalFetch;
  let browser;
  try {
    const portalOrigin = await portal.start({ SUPABASE_URL: "http://127.0.0.1:1", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic" }, { authOrigin: true });
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    let submitted;
    await page.route("**/api/portal/access-requests", async route => {
      submitted = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
    });
    await page.goto(`${portalOrigin}/portal`);
    await page.getByRole("tab", { name: "Create account", exact: true }).click();
    const honeypotField = page.locator('input[name="form_guard"]');
    assert.equal(await honeypotField.getAttribute("autocomplete"), "off");
    assert.equal(await honeypotField.getAttribute("tabindex"), "-1");
    assert.equal(await honeypotField.getAttribute("aria-hidden"), "true");
    await page.getByLabel("Full name", { exact: true }).fill("Synthetic Requester");
    await page.getByLabel("Email address", { exact: true }).fill("request@example.invalid");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByLabel("Phone / WhatsApp", { exact: true }).fill("+44 7700 900123");
    await page.getByRole("checkbox", { name: /I agree that TaxTrax may contact me/ }).check({ force: true });
    assert.equal(await honeypotField.inputValue(), "");
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    await page.getByRole("heading", { name: "Request received", exact: true }).waitFor();
    assert.equal(submitted.website, "");
    assert.equal(submitted.email, "request@example.invalid");
    assert.equal(Object.hasOwn(submitted, "form_guard"), false);
  } finally { globalThis.fetch = mockedFetch; await browser?.close(); await portal.stop(); }
});

test("honeypot success creates no record and duplicate acknowledgments reveal no identities", async () => {
  calls = [];
  const honeypotResult = await handler(request({ ...input, website: "bot" }));
  assert.equal(honeypotResult.status, 200);
  assert.deepEqual(await honeypotResult.json(), { ok: true });
  assert.equal(calls.length, 0);
  const first = await handler(request()); const duplicate = await handler(request());
  assert.equal(first.status, duplicate.status); assert.equal(await first.text(), await duplicate.text());
});

test("missing/wrong-target configuration and provider failures never fall back to SQLite", async () => {
  calls = [];
  delete process.env.ACCESS_REQUEST_SUBMISSION_SECRET;
  assert.equal((await handler(request())).status, 503); assert.equal(calls.length, 0);
  process.env.ACCESS_REQUEST_SUBMISSION_SECRET = secret;
  process.env.SUPABASE_URL = "https://another-project.supabase.co";
  assert.equal((await handler(request())).status, 503); assert.equal(calls.length, 0);
  process.env.SUPABASE_URL = "https://dbcakdqthnamgjfkkxzn.supabase.co";
  const successfulFetch = globalThis.fetch;
  try {
    for (const provider of [async () => new Response(`private ${secret}`, { status: 503 }), async () => { throw new Error(secret); }, async () => new Response("not JSON")]) {
      globalThis.fetch = provider;
      const result = await handler(request()); assert.equal(result.status, 503); assert.ok(!(await result.text()).includes(secret));
    }
  } finally { globalThis.fetch = successfulFetch; }
});

test("basic rate limit is bounded, independent of email, and ignores untrusted forwarded addresses", async () => {
  const successfulFetch = globalThis.fetch;
  try {
    process.env.TRUST_PROXY = "0";
    for (let index = 0; index < 5; index++) assert.equal((await handler(request())).status, 200);
    const blocked = await handler(request({ ...input, email: "other@example.invalid" }));
    assert.equal(blocked.status, 429); assert.ok(Number(blocked.headers.get("retry-after")) > 0);
  } finally { globalThis.fetch = successfulFetch; process.env.TRUST_PROXY = "1"; }
});
