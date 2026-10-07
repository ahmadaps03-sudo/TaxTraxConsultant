import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test, { after, before } from "node:test";
import { Webhook } from "standardwebhooks";
import { emailConfiguration, sendRecoveryEmail } from "../../supabase/functions/send-recovery-email/core.mjs";
import { redactRecoveryLog } from "./dev.mjs";
import { sessionTestBuild } from "./lib/session-test-build.mjs";

const origin = "http://localhost:3000";
const hash = "a".repeat(64);
const secret = randomBytes(32).toString("base64");
const config = emailConfiguration(name => ({ EMAILJS_SERVICE_ID: "synthetic-service", EMAILJS_TEMPLATE_ID: "synthetic-template",
  EMAILJS_PUBLIC_KEY: "synthetic-public", EMAILJS_PRIVATE_KEY: "synthetic-private", SEND_EMAIL_HOOK_SECRET: `v1,whsec_${secret}`, RECOVERY_ALLOWED_ORIGINS: origin })[name]);

function hookRequest(changes = {}, timestamp = new Date(), userChanges = {}) {
  const payload = JSON.stringify({ user: { email: "synthetic@example.invalid", email_confirmed_at: new Date().toISOString(), ...userChanges }, email_data: { email_action_type: "recovery", token_hash: hash, redirect_to: `${origin}/api/auth/recovery/callback`, ...changes } });
  return new Request("https://synthetic.example.invalid/hook", { method: "POST", headers: { "Content-Type": "application/json", "webhook-id": "synthetic-message",
    "webhook-timestamp": String(Math.floor(timestamp.getTime() / 1000)), "webhook-signature": new Webhook(secret).sign("synthetic-message", timestamp, payload) }, body: payload });
}

test("signed hook delivers only the configured recipient/link parameters through server REST", async () => {
  let sent;
  const result = await sendRecoveryEmail(hookRequest(), config, Webhook, async (url, options) => { sent = { url, options }; return new Response("OK"); });
  assert.equal(result.status, 200);
  assert.equal(sent.url, "https://api.emailjs.com/api/v1.0/email/send");
  assert.equal(sent.options.redirect, "error");
  const body = JSON.parse(sent.options.body);
  assert.equal(body.accessToken, config.EMAILJS_PRIVATE_KEY);
  assert.deepEqual(Object.keys(body.template_params).sort(), ["recovery_url", "to_email"]);
  assert.equal(body.template_params.to_email, "synthetic@example.invalid");
  assert.equal(new URL(body.template_params.recovery_url).searchParams.get("token_hash"), hash);
  assert.equal(new URL(body.template_params.recovery_url).searchParams.get("type"), "recovery");
  assert.equal(await result.text(), "{}");
});

test("hook rejects missing/forged/stale signatures without delivery", async () => {
  let deliveries = 0;
  const deliver = async () => { deliveries++; return new Response("OK"); };
  const missing = new Request("https://synthetic.example.invalid", { method: "POST", body: "{}" });
  assert.equal((await sendRecoveryEmail(missing, config, Webhook, deliver)).status, 401);
  const forged = hookRequest();
  forged.headers.set("webhook-signature", "v1,invalid");
  assert.equal((await sendRecoveryEmail(forged, config, Webhook, deliver)).status, 401);
  assert.equal((await sendRecoveryEmail(hookRequest({}, new Date(Date.now() - 600_000)), config, Webhook, deliver)).status, 401);
  assert.equal(deliveries, 0);
});

test("hook refuses other auth actions, redirect manipulation and oversized payloads", async () => {
  for (const changes of [{ email_action_type: "signup" }, { redirect_to: "https://unapproved.example.invalid/api/auth/recovery/callback" },
    { redirect_to: `${origin}/api/auth/recovery/callback?next=https://unapproved.example.invalid` }, { token_hash: "invalid" }]) {
    assert.equal((await sendRecoveryEmail(hookRequest(changes), config, Webhook, () => { throw new Error("Must not deliver"); })).status, 400);
  }
  assert.equal((await sendRecoveryEmail(new Request("https://synthetic.example.invalid", { method: "POST", body: "x".repeat(32769) }), config, Webhook)).status, 401);
});

test("EmailJS failures never return keys, token hashes or raw provider messages", async () => {
  const result = await sendRecoveryEmail(hookRequest(), config, Webhook, async () => new Response("raw provider failure", { status: 403 }));
  assert.equal(result.status, 503);
  const text = await result.text();
  for (const value of [hash, secret, config.EMAILJS_PRIVATE_KEY, "raw provider failure"]) assert.ok(!text.includes(value));
});

test("recovery delivery cannot activate an unconfirmed Auth account", async () => {
  const result = await sendRecoveryEmail(hookRequest({}, new Date(), { email_confirmed_at: null }), config, Webhook, () => { throw new Error("Unconfirmed identity must not receive recovery proof"); });
  assert.equal(result.status, 400);
});

test("hook configuration fails closed and development request logs redact recovery proof", () => {
  assert.throws(() => emailConfiguration(() => undefined));
  assert.equal(redactRecoveryLog(`GET /api/auth/recovery/callback?token_hash=${hash}&type=recovery 303`), "GET /api/auth/recovery/callback?[redacted] 303");
  assert.equal(redactRecoveryLog(`GET /api/auth/recovery/callback?token%5Fhash=${hash}&type=recovery 303`), "GET /api/auth/recovery/callback?[redacted] 303");
  assert.equal(redactRecoveryLog("GET /portal 200"), "GET /portal 200");
});

let build;
let recovery;
let clientModule;
let authorization;
let originalClient;
let originalAuthorization;
let originalFetch;
let oldEnvironment;
let scoped;
let eligibility;
let updates;
let signOuts;

before(async () => {
  oldEnvironment = { AUTH_ORIGIN: process.env.AUTH_ORIGIN, SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY };
  Object.assign(process.env, { AUTH_ORIGIN: origin, SUPABASE_URL: "https://dbcakdqthnamgjfkkxzn.supabase.co", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic" });
  build = await sessionTestBuild(["lib/auth/recovery.ts", "lib/auth/request.ts", "lib/validation.ts"]);
  recovery = build.require("lib/auth/recovery.js");
  clientModule = build.require("lib/supabase/client.js");
  authorization = build.require("lib/auth/authorize.js");
  originalClient = clientModule.createRequestSupabaseClient;
  originalAuthorization = authorization.authorizePortalClient;
  originalFetch = globalThis.fetch;
});

after(async () => {
  if (clientModule) clientModule.createRequestSupabaseClient = originalClient;
  if (authorization) authorization.authorizePortalClient = originalAuthorization;
  if (originalFetch) globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(oldEnvironment ?? {})) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  await build?.stop();
});

function request(body, options = {}) {
  return new Request(`${origin}/api/auth/recovery/verify`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json", "X-TaxTrax-Auth": "1", Cookie: `taxtrax-recovery-link=${hash}`, ...options.headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
}

function mockSession() {
  updates = [];
  signOuts = [];
  eligibility = { status: "authorized", user: { id: "synthetic-user", email: "synthetic@example.invalid", name: "Synthetic Client" } };
  const state = build.require("lib/supabase/cookies.js").createAuthCookieState(null, "sb-dbcakdqthnamgjfkkxzn-auth-token-recovery");
  scoped = { state, writable: true, client: { auth: {
    verifyOtp: async () => { state.setAll([{ name: "sb-dbcakdqthnamgjfkkxzn-auth-token-recovery", value: "synthetic-session", options: {} }]); return { error: null }; },
    updateUser: async value => { updates.push(value); return { error: null }; },
    signOut: async value => { signOuts.push(value); return { error: null }; },
  } } };
  clientModule.createRequestSupabaseClient = (...args) => {
    assert.equal(args[4], "recovery");
    if (args[3]) scoped.client.auth.signOut = async value => { signOuts.push(value); args[3](200, false); return { error: null }; };
    return scoped;
  };
  authorization.authorizePortalClient = async () => eligibility;
}

test("recovery endpoints enforce existing CSRF, JSON/body and exact-field controls", async () => {
  for (const handler of [recovery.requestRecovery, recovery.verifyRecovery, recovery.updateRecoveredPassword]) {
    for (const [options, expected] of [[{ headers: { Origin: "https://other.example.invalid" } }, 403], [{ headers: { Origin: "null" } }, 403],
      [{ headers: { "X-TaxTrax-Auth": "0" } }, 403], [{ headers: { "Sec-Fetch-Site": "cross-site" } }, 403], [{ headers: { "Content-Type": "text/plain" } }, 415]]) {
      assert.equal((await handler(request({}, options))).status, expected);
    }
    assert.equal((await handler(request("{"))).status, 400);
    assert.equal((await handler(request("x".repeat(4097)))).status, 413);
  }
  assert.equal((await recovery.requestRecovery(request({ email: "synthetic@example.invalid", redirect: "https://other.example.invalid" }))).status, 400);
});

test("known/unknown emails and delivery/provider errors get identical padded generic responses", async () => {
  const paths = [];
  globalThis.fetch = async (input, options) => {
    paths.push({ url: String(input), body: JSON.parse(options.body) });
    return new Response('{"message":"sanitized provider failure"}', { status: 503, headers: { "Content-Type": "application/json" } });
  };
  const began = Date.now();
  const results = await Promise.all(["known@example.invalid", "unknown@example.invalid"].map(email => recovery.requestRecovery(request({ email }))));
  assert.ok(Date.now() - began >= 5400);
  for (const result of results) {
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), { ok: true });
    assert.match(result.headers.get("cache-control"), /no-store/);
    assert.equal(result.headers.get("set-cookie"), null);
  }
  assert.equal(paths.length, 2);
  assert.ok(paths.every(item => new URL(item.url).pathname === "/auth/v1/recover"));
  assert.ok(paths.every(item => !item.body.code_challenge));
  const repeated = await recovery.requestRecovery(request({ email: "known@example.invalid" }));
  assert.equal(repeated.status, 200);
  assert.equal(paths.length, 2);
  globalThis.fetch = originalFetch;
});

test("missing provider configuration returns only sanitized unavailable feedback", async () => {
  const saved = process.env.SUPABASE_PUBLISHABLE_KEY;
  try {
    delete process.env.SUPABASE_PUBLISHABLE_KEY;
    const result = await recovery.requestRecovery(request({ email: "missing-config@example.invalid" }));
    assert.equal(result.status, 503);
    assert.deepEqual(await result.json(), { ok: false, error: "Password recovery is temporarily unavailable. Please try again." });
  } finally { process.env.SUPABASE_PUBLISHABLE_KEY = saved; }
});

test("callback stages proof in a scoped HttpOnly cookie, strips URL and does not consume OTP on GET", async () => {
  let calls = 0;
  clientModule.createRequestSupabaseClient = () => { calls++; throw new Error("GET must not consume proof"); };
  const result = await recovery.recoveryCallback(new Request(`${origin}/api/auth/recovery/callback?token_hash=${hash}&type=recovery`));
  assert.equal(result.status, 303);
  assert.equal(result.headers.get("location"), `${origin}/portal/reset-password`);
  assert.equal(result.headers.get("referrer-policy"), "no-referrer");
  const cookie = result.cookies.get("taxtrax-recovery-link");
  assert.equal(cookie.httpOnly, true);
  assert.equal(cookie.path, "/api/auth/recovery");
  assert.equal(cookie.sameSite, "lax");
  assert.equal(calls, 0);
  assert.ok(!(await result.text()).includes(hash));
  for (const query of [`token_hash=${hash}&type=signup`, `token_hash=${hash}&type=recovery&next=other`, `token_hash=${hash}&token_hash=${hash}&type=recovery`, "token_hash=bad&type=recovery"]) {
    const invalid = await recovery.recoveryCallback(new Request(`${origin}/api/auth/recovery/callback?${query}`));
    assert.equal(invalid.headers.get("location"), `${origin}/portal/reset-password?invalid=1`);
    assert.equal(invalid.cookies.get("taxtrax-recovery-link").value, "");
  }
});

test("verification requires exactly one proof and rejects invalid/expired/used OTPs", async () => {
  mockSession();
  for (const cookie of ["", `taxtrax-recovery-link=bad`, `taxtrax-recovery-link=${hash}; taxtrax-recovery-link=${hash}`]) {
    assert.equal((await recovery.verifyRecovery(request({}, { headers: { Cookie: cookie } }))).status, 401);
  }
  scoped.client.auth.verifyOtp = async () => ({ error: { status: 403, message: "raw secret error" } });
  const denied = await recovery.verifyRecovery(request({}));
  assert.equal(denied.status, 401);
  assert.ok(!(await denied.text()).includes("raw secret error"));
  assert.equal(denied.cookies.get("taxtrax-recovery-link").value, "");
});

test("ineligible/profile-failure recovery never commits a browser auth session", async () => {
  for (const status of ["ineligible", "unavailable"]) {
    mockSession();
    eligibility = { status };
    const denied = await recovery.verifyRecovery(request({}));
    assert.equal(denied.status, status === "ineligible" ? 401 : 503);
    assert.ok(!denied.headers.get("set-cookie").includes("synthetic-session"));
    assert.deepEqual(signOuts, [{ scope: "local" }]);
  }
});

test("successful verification commits only isolated recovery cookies and no tokens in JSON", async () => {
  mockSession();
  const result = await recovery.verifyRecovery(request({}));
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { ok: true });
  assert.equal(result.cookies.get("sb-dbcakdqthnamgjfkkxzn-auth-token-recovery").value, "synthetic-session");
  assert.equal(result.cookies.get("sb-dbcakdqthnamgjfkkxzn-auth-token"), undefined);
});

test("reset reuses existing password validation without transforming password bytes", async () => {
  mockSession();
  for (const [password, confirm] of [["short1", "short1"], ["password123", "password123"], ["synthetic-good123", "synthetic-good123"], ["DifferentPass23", "not-matching"]]) {
    assert.equal((await recovery.updateRecoveredPassword(request({ password, confirm }))).status, 400);
  }
  assert.equal(updates.length, 0);
  const password = "  New-safe-password42!  ";
  const result = await recovery.updateRecoveredPassword(request({ password, confirm: password }));
  assert.equal(result.status, 200);
  assert.deepEqual(updates, [{ password }]);
  assert.deepEqual(signOuts, [{ scope: "global" }]);
  assert.deepEqual(await result.json(), { ok: true });
  assert.equal(result.cookies.get("sb-dbcakdqthnamgjfkkxzn-auth-token-recovery").value, "");
});

test("provider failure and ineligible identity fail closed during reset", async () => {
  mockSession();
  eligibility = { status: "ineligible" };
  assert.equal((await recovery.updateRecoveredPassword(request({ password: "New-safe-password42!", confirm: "New-safe-password42!" }))).status, 401);
  assert.equal(updates.length, 0);
  mockSession();
  const factory = clientModule.createRequestSupabaseClient;
  clientModule.createRequestSupabaseClient = (...args) => {
    const result = factory(...args);
    result.client.auth.signOut = async () => ({ error: { status: 503 } });
    return result;
  };
  assert.equal((await recovery.updateRecoveredPassword(request({ password: "New-safe-password42!", confirm: "New-safe-password42!" }))).status, 503);
  mockSession();
  const suppressedFactory = clientModule.createRequestSupabaseClient;
  clientModule.createRequestSupabaseClient = (...args) => {
    const result = suppressedFactory(...args);
    result.client.auth.signOut = async () => { args[3](403, false); return { error: null }; };
    return result;
  };
  assert.equal((await recovery.updateRecoveredPassword(request({ password: "New-safe-password42!", confirm: "New-safe-password42!" }))).status, 503);
});
