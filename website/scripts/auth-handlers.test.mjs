import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { request as httpRequest } from "node:http";
import test, { after, before } from "node:test";
import { fixturePassword, localFixtureContext, provisionFixtures, removeTestFixtures } from "./lib/supabase-fixtures.mjs";
import { sessionTestBuild } from "./lib/session-test-build.mjs";
import { authTestProxy } from "./lib/auth-test-proxy.mjs";

const namespace = randomUUID();
const spacedPassword = "  Synthetic Ée\u0301 TaxTrax-password!  ";
let context;
let fixtures;
let build;
let proxy;
let origin;
let primary;
let independent;
const issuedCookies = [];

function credentials(key = "active-a") {
  return { email: fixtures[key].email, password: key === "active-b" ? spacedPassword : fixturePassword };
}

function cookiesOf(response) {
  return response.headers.getSetCookie().map(line => {
    const [pair] = line.split(";");
    const separator = pair.indexOf("=");
    return { name: pair.slice(0, separator), value: pair.slice(separator + 1), line };
  });
}

function browserHeader(response) {
  return cookiesOf(response).filter(cookie => cookie.value && !/Max-Age=0/i.test(cookie.line)).map(cookie => `${cookie.name}=${cookie.value}`).join("; ");
}

function chunkedHeader(session, size = 500) {
  const value = `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
  return Array.from({ length: Math.ceil(value.length / size) }, (_, index) => `sb-127-auth-token.${index}=${value.slice(index * size, (index + 1) * size)}`).join("; ");
}

async function post(endpoint, body = {}, options = {}) {
  const headers = new Headers({ Origin: origin, "X-TaxTrax-Auth": "1", "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin" });
  for (const [name, value] of Object.entries(options.headers ?? {})) {
    if (value === null) headers.delete(name);
    else headers.set(name, value);
  }
  const response = await new Promise((resolve, reject) => {
    const outgoing = httpRequest(`${origin}/api/auth/${endpoint}`, { method: "POST", headers: Object.fromEntries(headers) }, incoming => {
      const chunks = [];
      incoming.on("data", chunk => chunks.push(chunk));
      incoming.on("end", () => {
        const responseHeaders = new Headers();
        for (let index = 0; index < incoming.rawHeaders.length; index += 2) responseHeaders.append(incoming.rawHeaders[index], incoming.rawHeaders[index + 1]);
        resolve(new Response(Buffer.concat(chunks), { status: incoming.statusCode, headers: responseHeaders }));
      });
      incoming.on("error", () => reject(new Error("Local HTTP test response failed.")));
    });
    outgoing.on("error", () => reject(new Error("Local HTTP test request failed.")));
    outgoing.setTimeout(30_000, () => outgoing.destroy());
    outgoing.end(options.raw ?? JSON.stringify(body));
  });
  const text = await response.text();
  const payload = JSON.parse(text);
  assert.ok(response.headers.get("Cache-Control")?.includes("no-store"));
  assert.equal(response.headers.get("Location"), null);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
  assert.equal(response.headers.get("Access-Control-Allow-Credentials"), null);
  for (const session of proxy.sessions) {
    assert.ok(!text.includes(session.access_token) && !text.includes(session.refresh_token), "Auth JSON must not expose tokens");
    for (const [name, value] of response.headers) {
      if (name !== "set-cookie") assert.ok(!value.includes(session.access_token) && !value.includes(session.refresh_token), "Tokens may occur only inside successful auth cookies");
    }
  }
  if (response.status !== 200) assert.ok(cookiesOf(response).every(cookie => !cookie.value && /Max-Age=0/i.test(cookie.line)), "Failure must never commit a session-bearing cookie");
  issuedCookies.push(...cookiesOf(response).filter(cookie => cookie.value).map(cookie => cookie.value));
  return { response, payload, text };
}

async function profileRows(session) {
  const response = await fetch(`${context.url}/rest/v1/client_profiles?select=user_id,name,status`, { headers: { apikey: context.publishableKey, Authorization: `Bearer ${session.access_token}` }, redirect: "error" });
  assert.equal(response.status, 200, "Unprivileged JWT assertion must reach RLS");
  return response.json();
}

async function directSignIn() {
  const client = context.client();
  const result = await client.auth.signInWithPassword(credentials());
  assert.equal(result.error, null, "Independent synthetic session setup failed");
  return result.data.session;
}

before(async () => {
  context = await localFixtureContext();
  fixtures = await provisionFixtures(context, namespace);
  const changed = await context.admin.auth.admin.updateUserById(fixtures["active-b"].id, { password: spacedPassword });
  assert.equal(changed.error, null, "Synthetic whitespace password fixture setup failed");
  proxy = await authTestProxy(context);
  build = await sessionTestBuild(["lib/auth/request.ts", "lib/auth/handlers.ts", "app/api/auth/login/route.ts", "app/api/auth/logout/route.ts"]);
  origin = await build.start({ SUPABASE_URL: proxy.url, SUPABASE_PUBLISHABLE_KEY: context.publishableKey }, { authOrigin: true });
});

after(async () => {
  await build?.stop();
  await proxy?.stop();
  if (context) await removeTestFixtures(context, namespace);
});

test("active confirmed client signs in, obtains only its RLS profile and secure cookies", async () => {
  const result = await post("login", { ...credentials(), email: `  ${fixtures["active-a"].email.toUpperCase()}  ` });
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.payload, { ok: true });
  primary = { header: browserHeader(result.response), session: proxy.sessions.at(-1) };
  assert.ok(primary.header);
  assert.equal(primary.session.user.id, fixtures["active-a"].id);
  assert.deepEqual((await profileRows(primary.session)).map(row => row.user_id), [fixtures["active-a"].id]);
  assert.ok(cookiesOf(result.response).every(cookie => /HttpOnly/i.test(cookie.line) && /Secure/i.test(cookie.line) && /SameSite=Lax/i.test(cookie.line) && /Path=\//i.test(cookie.line) && !/Domain=/i.test(cookie.line)));
});

test("wrong password and unknown email have identical generic status and body", async () => {
  const wrong = await post("login", { ...credentials(), password: "Synthetic-wrong-password!" });
  const unknown = await post("login", { email: `absent.${namespace}@taxtrax.example.invalid`, password: fixturePassword });
  assert.equal(wrong.response.status, 401);
  assert.equal(unknown.response.status, wrong.response.status);
  assert.deepEqual(unknown.payload, wrong.payload);
  assert.deepEqual(wrong.payload, { ok: false, error: "Unable to sign in." });
});

for (const key of ["pending", "suspended", "no-profile", "unconfirmed"]) {
  test(`${key} cannot obtain portal login or usable browser cookies`, async () => {
    const start = proxy.sessions.length;
    const result = await post("login", credentials(key));
    assert.equal(result.response.status, 401);
    assert.deepEqual(result.payload, { ok: false, error: "Unable to sign in." });
    assert.equal(browserHeader(result.response), "");
    const replay = await fetch(`${origin}/portal`, { headers: { cookie: browserHeader(result.response) } });
    assert.ok((await replay.text()).includes("ineligible"));
    for (const session of proxy.sessions.slice(start)) {
      const refreshed = await context.client().auth.refreshSession({ refresh_token: session.refresh_token });
      assert.ok(refreshed.error, "Rejected sign-in must revoke its newly created refresh state");
    }
  });
}

for (const endpoint of ["login", "logout"]) {
  test(`${endpoint}: exact Origin, required custom header and Fetch Metadata protections`, async () => {
    const count = proxy.requests.length;
    for (const headers of [
      { "X-TaxTrax-Auth": null }, { "X-TaxTrax-Auth": "0" }, { Origin: null }, { Origin: "null" },
      { Origin: origin.replace("http:", "https:") }, { Origin: "http://127.0.0.1:1" },
      { Origin: origin.replace("127.0.0.1", "localhost") }, { Origin: `${origin}/` },
      { "Sec-Fetch-Site": "cross-site" }, { "Sec-Fetch-Site": "same-site" }, { "Sec-Fetch-Site": "none" },
      { "Sec-Fetch-Mode": "navigate" }, { "Sec-Fetch-Dest": "iframe" },
    ]) {
      const result = await post(endpoint, endpoint === "login" ? credentials() : {}, { headers: { Cookie: primary.header, ...headers } });
      assert.equal(result.response.status, 403);
      assert.equal(result.response.headers.get("Set-Cookie"), null);
    }
    assert.equal(proxy.requests.length, count, "Rejected request boundaries must never call the provider");
  });

  test(`${endpoint}: JSON content type, bounded streaming body and safe parsing`, async () => {
    for (const type of [null, "text/plain", "application/x-www-form-urlencoded", "application/json; charset=latin1"]) {
      const result = await post(endpoint, {}, { headers: { "Content-Type": type } });
      assert.equal(result.response.status, 415);
    }
    for (const raw of ["{invalid", "null", "[]", '"string"']) {
      assert.equal((await post(endpoint, {}, { raw })).response.status, 400);
    }
    assert.equal((await post(endpoint, {}, { raw: JSON.stringify({ padding: "x".repeat(4096) }) })).response.status, 413);
    const headers = { Origin: origin, "X-TaxTrax-Auth": "1", "Content-Type": "application/json" };
    const streamed = await fetch(`${origin}/api/auth/${endpoint}`, { method: "POST", headers, body: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{"padding":"')); controller.enqueue(new TextEncoder().encode("x".repeat(4096))); controller.enqueue(new TextEncoder().encode('"}')); controller.close(); } }), duplex: "half" });
    assert.equal(streamed.status, 413, "Streaming bytes must be bounded without Content-Length");
    await streamed.arrayBuffer();
  });

  test(`${endpoint}: non-POST methods and credentialed CORS preflight are rejected`, async () => {
    for (const method of ["GET", "HEAD", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
      const response = await fetch(`${origin}/api/auth/${endpoint}`, { method, headers: { Origin: "https://unapproved.example.invalid", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "x-taxtrax-auth,content-type" }, redirect: "manual" });
      assert.equal(response.status, 405);
      assert.equal(response.headers.get("Allow"), "POST");
      assert.ok(response.headers.get("Cache-Control")?.includes("no-store"));
      assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
      await response.arrayBuffer();
    }
  });
}

test("strict credential types, email shape/control characters and input bounds", async () => {
  const inputs = [
    {}, { email: fixtures["active-a"].email }, { ...credentials(), email: 1 }, { ...credentials(), password: 1 },
    { ...credentials(), password: "" }, { ...credentials(), password: "é".repeat(513) },
    { ...credentials(), email: "invalid" }, { ...credentials(), email: `\n${fixtures["active-a"].email}` },
    { ...credentials(), email: `a..b@taxtrax.example.invalid` }, { ...credentials(), email: `a@-invalid.example` },
    { ...credentials(), email: `${"a".repeat(65)}@taxtrax.example.invalid` },
    { ...credentials(), email: `${"a".repeat(64)}@${Array(4).fill("a".repeat(63)).join(".")}` },
  ];
  const count = proxy.requests.length;
  for (const body of inputs) assert.equal((await post("login", body)).response.status, 400);
  assert.equal(proxy.requests.length, count);
});

test("extra/security-sensitive fields and arbitrary destinations are rejected", async () => {
  for (const field of ["user_id", "profile_id", "role", "status", "redirect", "remember", "mfa", "next", "__proto__", "extra"]) {
    assert.equal((await post("login", { ...credentials(), [field]: "/outside" })).response.status, 400);
    assert.equal((await post("logout", { [field]: "/outside" })).response.status, 400);
  }
});

test("password whitespace, case and Unicode content are preserved exactly", async () => {
  const exact = await post("login", credentials("active-b"));
  assert.equal(exact.response.status, 200);
  for (const password of [spacedPassword.trim(), spacedPassword.toLowerCase(), spacedPassword.normalize("NFC")]) {
    const changed = await post("login", { ...credentials("active-b"), password });
    assert.equal(changed.response.status, 401);
  }
});

test("profile/provider validation failures after sign-in discard cookies and revoke the new session", async () => {
  for (const path of ["/rest/v1/client_profiles", "/auth/v1/user"]) {
    proxy.faults.set(path, 503);
    let result;
    try { result = await post("login", credentials()); }
    finally { proxy.faults.clear(); }
    assert.equal(result.response.status, 503);
    assert.equal(browserHeader(result.response), "");
    const session = proxy.sessions.at(-1);
    assert.deepEqual(await profileRows(session), []);
    assert.ok((await context.client().auth.refreshSession({ refresh_token: session.refresh_token })).error);
  }
});

test("revocation between provider sign-in and the RLS lookup fails closed", async () => {
  proxy.faults.set("/rest/v1/client_profiles", "revoke");
  let result;
  try { result = await post("login", credentials()); }
  finally { proxy.faults.clear(); }
  assert.equal(result.response.status, 401);
  assert.equal(browserHeader(result.response), "");
  assert.deepEqual(await profileRows(proxy.sessions.at(-1)), []);
});

test("failed compensating revocation never commits a newly established browser session", async () => {
  proxy.faults.set("/rest/v1/client_profiles", 503);
  proxy.faults.set("/auth/v1/logout", 503);
  let result;
  try { result = await post("login", credentials()); }
  finally { proxy.faults.clear(); }
  assert.equal(result.response.status, 503);
  assert.equal(browserHeader(result.response), "");
  const session = proxy.sessions.at(-1);
  const cleanup = await fetch(`${context.url}/auth/v1/logout?scope=local`, { method: "POST", headers: { apikey: context.publishableKey, Authorization: `Bearer ${session.access_token}` } });
  assert.ok(cleanup.ok, "Residual synthetic session must be cleaned up after injected revocation failure");
});

test("provider sign-in outages and abuse limits fail safely without session cookies", async () => {
  for (const failure of [503, "disconnect", 429]) {
    proxy.faults.set("/auth/v1/token", failure);
    let result;
    try { result = await post("login", credentials()); }
    finally { proxy.faults.clear(); }
    assert.equal(result.response.status, failure === 429 ? 429 : 503);
    assert.equal(browserHeader(result.response), "");
  }
});

test("logout revokes only the current session, clears cookies and denies unexpired JWT replay", async () => {
  independent = await directSignIn();
  const result = await post("logout", {}, { headers: { Cookie: primary.header } });
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.payload, { ok: true });
  assert.ok(primary.session.expires_at > Date.now() / 1000);
  assert.deepEqual(await profileRows(primary.session), []);
  assert.ok((await context.client().auth.refreshSession({ refresh_token: primary.session.refresh_token })).error);
  assert.ok(cookiesOf(result.response).length > 0);
  assert.ok(cookiesOf(result.response).every(cookie => !cookie.value && /Max-Age=0/i.test(cookie.line)));
  assert.deepEqual((await profileRows(independent)).map(row => row.user_id), [fixtures["active-a"].id]);
});

test("repeated logout with absent or already-revoked cookies is idempotent", async () => {
  for (const header of ["", primary.header]) {
    const result = await post("logout", {}, { headers: { Cookie: header } });
    assert.equal(result.response.status, 200);
    assert.deepEqual(result.payload, { ok: true });
  }
});

test("logout clears complete SDK chunks and malformed obsolete fragments without claiming unconfirmed revocation", async () => {
  const header = chunkedHeader(independent);
  const result = await post("logout", {}, { headers: { Cookie: header } });
  assert.equal(result.response.status, 200);
  const names = new Set(cookiesOf(result.response).map(cookie => cookie.name));
  for (const pair of header.split("; ")) assert.ok(names.has(pair.split("=")[0]));
  const obsolete = await post("logout", {}, { headers: { Cookie: "sb-127-auth-token.0=broken; sb-127-auth-token.99=obsolete" } });
  assert.equal(obsolete.response.status, 400);
  assert.deepEqual(cookiesOf(obsolete.response).map(cookie => cookie.name).sort(), ["sb-127-auth-token", "sb-127-auth-token.0", "sb-127-auth-token.99"]);
});

test("logout never mistakes SDK-suppressed HTTP errors or network failure for revocation", async () => {
  const live = proxy.sessions.find(session => session.user.id === fixtures["active-b"].id);
  for (const failure of [401, 403, 404, 503, "disconnect"]) {
    proxy.faults.set("/auth/v1/logout", failure);
    let result;
    try { result = await post("logout", {}, { headers: { Cookie: chunkedHeader(live) } }); }
    finally { proxy.faults.clear(); }
    assert.equal(result.response.status, 503);
    assert.equal(result.payload.ok, false);
    assert.equal(browserHeader(result.response), "");
    assert.deepEqual((await profileRows(live)).map(row => row.user_id), [fixtures["active-b"].id], "Injected revocation failure must remain explicitly unconfirmed, not silently succeed");
  }
});

test("missing/invalid authentication configuration fails safely without cookies or provider calls", async () => {
  const saved = Object.fromEntries(["AUTH_ORIGIN", "SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY"].map(name => [name, process.env[name]]));
  const handlers = build.require("lib/auth/handlers.js");
  const calls = proxy.requests.length;
  try {
    for (const invalid of [
      { AUTH_ORIGIN: undefined }, { AUTH_ORIGIN: `${origin}/` },
      { SUPABASE_URL: undefined }, { SUPABASE_PUBLISHABLE_KEY: undefined }, { SUPABASE_PUBLISHABLE_KEY: "sb_secret_synthetic" },
    ]) {
      Object.assign(process.env, { AUTH_ORIGIN: origin, SUPABASE_URL: proxy.url, SUPABASE_PUBLISHABLE_KEY: context.publishableKey });
      for (const [name, value] of Object.entries(invalid)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
      for (const endpoint of ["login", "logout"]) {
        const request = new Request(`${origin}/api/auth/${endpoint}`, { method: "POST", headers: { Origin: origin, "X-TaxTrax-Auth": "1", "Content-Type": "application/json" }, body: JSON.stringify(endpoint === "login" ? credentials() : {}) });
        const response = await handlers[endpoint](request);
        assert.equal(response.status, 503);
        assert.equal(response.headers.get("Set-Cookie"), null);
        assert.deepEqual(await response.json(), { ok: false, error: "Authentication is temporarily unavailable. Please try again." });
      }
    }
  } finally {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
  assert.equal(proxy.requests.length, calls);
});

test("request reader rejects invalid UTF-8, forged size hints and stalled streams before authentication", async () => {
  const saved = process.env.AUTH_ORIGIN;
  process.env.AUTH_ORIGIN = origin;
  const handlers = build.require("lib/auth/handlers.js");
  const headers = { Origin: origin, "X-TaxTrax-Auth": "1", "Content-Type": "application/json" };
  const count = proxy.requests.length;
  try {
    const invalid = new Request(`${origin}/api/auth/login`, { method: "POST", headers, body: new Uint8Array([0xff, 0xfe]) });
    assert.equal((await handlers.login(invalid)).status, 400);
    const large = new Request(`${origin}/api/auth/login`, { method: "POST", headers: { ...headers, "Content-Length": "1" }, body: JSON.stringify({ padding: "😀".repeat(1024) }) });
    assert.equal((await handlers.login(large)).status, 413);
    let cancelled = false;
    const stalled = new Request(`${origin}/api/auth/login`, { method: "POST", headers, body: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("{")); }, cancel() { cancelled = true; } }), duplex: "half" });
    assert.equal((await handlers.login(stalled)).status, 408);
    assert.equal(cancelled, true);
  } finally {
    if (saved === undefined) delete process.env.AUTH_ORIGIN;
    else process.env.AUTH_ORIGIN = saved;
  }
  assert.equal(proxy.requests.length, count);
});

test("concurrent login requests keep distinct session cookies and provider identities", async () => {
  const results = await Promise.all(["active-a", "active-b"].map(key => post("login", credentials(key))));
  for (const [index, result] of results.entries()) {
    assert.equal(result.response.status, 200);
    const header = browserHeader(result.response);
    const response = await fetch(`${origin}/portal`, { headers: { Cookie: header } });
    const body = await response.text();
    const own = fixtures[index ? "active-b" : "active-a"].id;
    const other = fixtures[index ? "active-a" : "active-b"].id;
    assert.ok(body.includes(own) && !body.includes(other));
  }
  assert.ok(browserHeader(results[0].response) !== browserHeader(results[1].response));
});

test("sequential login handlers replace prior cookie fragments without reusing another identity", async () => {
  const first = await post("login", credentials());
  assert.equal(first.response.status, 200);
  const session = proxy.sessions.at(-1);
  const old = chunkedHeader(session);
  const second = await post("login", credentials("active-b"), { headers: { Cookie: old } });
  assert.equal(second.response.status, 200);
  const response = await fetch(`${origin}/portal`, { headers: { Cookie: browserHeader(second.response) } });
  const body = await response.text();
  assert.ok(body.includes(fixtures["active-b"].id) && !body.includes(fixtures["active-a"].id));
  const deletes = cookiesOf(second.response).filter(cookie => !cookie.value).map(cookie => cookie.name);
  assert.ok(deletes.length > 0, "Old fragments not used by the new session must be deleted");
});

test("application logs contain no passwords, raw auth cookies or captured session tokens", () => {
  const sensitive = [fixturePassword, spacedPassword, ...issuedCookies, ...proxy.sessions.flatMap(session => [session.access_token, session.refresh_token])];
  assert.equal(build.logsContain(sensitive), false);
});
