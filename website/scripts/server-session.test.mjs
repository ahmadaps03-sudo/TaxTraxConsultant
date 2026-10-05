import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import test, { after, before } from "node:test";
import { fixturePassword, localFixtureContext, provisionFixtures, removeTestFixtures } from "./lib/supabase-fixtures.mjs";
import { runLocalSupabase } from "./supabase-local-env.mjs";
import { sessionTestBuild } from "./lib/session-test-build.mjs";

const namespace = randomUUID();
const originalEnvironment = { SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY };
let context;
let fixtures;
let build;
let environment;
let configuration;
let modules;
let origin;
const sessions = {};

function cookieHeader(session, size = 3180) {
  const value = `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
  if (value.length <= size) return `${configuration.cookieName}=${value}`;
  return Array.from({ length: Math.ceil(value.length/size) }, (_, index) => `${configuration.cookieName}.${index}=${value.slice(index*size,(index+1)*size)}`).join("; ");
}

async function authorize(header, writable = false) {
  const request = modules.client.createRequestSupabaseClient(header, writable ? () => {} : undefined, environment);
  return modules.authorize.authorizePortalClient(request);
}

async function signIn(key = "active-a") {
  const client = context.client();
  const result = await client.auth.signInWithPassword({ email: fixtures[key].email, password: fixturePassword });
  assert.equal(result.error, null, "Synthetic provider sign-in setup failed");
  return { session: result.data.session, client };
}

async function expiredSessionFixture() {
  const signed = await signIn();
  const status = JSON.parse(await runLocalSupabase(["status", "--output", "json"]));
  const parts = signed.session.access_token.split(".");
  const header = JSON.parse(Buffer.from(parts[0], "base64url"));
  assert.equal(header.alg, "HS256", "Local expired-token fixture requires the validated local signing format");
  assert.ok(status.JWT_SECRET, "Local signing credential is required for synthetic expired-token setup only");
  const claims = { ...JSON.parse(Buffer.from(parts[1], "base64url")), exp: Math.floor(Date.now()/1000)-60 };
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = createHmac("sha256", status.JWT_SECRET).update(`${parts[0]}.${body}`).digest("base64url");
  return { ...signed.session, access_token: `${parts[0]}.${body}.${signature}`, expires_at: claims.exp };
}

before(async () => {
  context = await localFixtureContext();
  fixtures = await provisionFixtures(context, namespace);
  environment = { SUPABASE_URL: context.url, SUPABASE_PUBLISHABLE_KEY: context.publishableKey };
  Object.assign(process.env, environment);
  build = await sessionTestBuild();
  modules = Object.fromEntries(["config", "cookies", "client", "cache", "middleware"].map(name => [name, build.require(`lib/supabase/${name}.js`)]));
  modules.authorize = build.require("lib/auth/authorize.js");
  configuration = modules.config.getSupabaseConfiguration(environment);
  for (const key of ["active-a", "active-b", "pending", "suspended", "no-profile"]) sessions[key] = (await signIn(key)).session;
});

after(async () => {
  await build?.stop();
  if (context) await removeTestFixtures(context, namespace);
  for (const [name, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

test("anonymous and legacy SQLite cookie requests yield no authorized identity", async () => {
  assert.equal((await authorize(null)).status, "ineligible");
  assert.equal((await authorize("tt_session=synthetic-legacy-cookie")).status, "ineligible");
});

test("valid active client yields only its safe provider-validated identity", async () => {
  const result = await authorize(cookieHeader(sessions["active-a"]));
  assert.equal(result.status, "authorized");
  assert.deepEqual(result.user, { id: fixtures["active-a"].id, email: fixtures["active-a"].email, name: "Synthetic Client A" });
});

test("forged cookie user metadata cannot impersonate client B", async () => {
  const fake = { ...sessions["active-a"], user: { ...sessions["active-b"].user } };
  const result = await authorize(cookieHeader(fake));
  assert.equal(result.status, "authorized");
  assert.equal(result.user.id, fixtures["active-a"].id);
});

for (const key of ["pending", "suspended", "no-profile"]) {
  test(`${key} profile yields no authorized identity`, async () => {
    assert.equal((await authorize(cookieHeader(sessions[key]))).status, "ineligible");
  });
}

test("provider-returned unconfirmed identity is rejected before profile lookup", async () => {
  const request = modules.client.createRequestSupabaseClient(null, undefined, environment);
  request.client.auth.getUser = async () => ({ data: { user: { id: fixtures.unconfirmed.id, email: fixtures.unconfirmed.email, email_confirmed_at: null } }, error: null });
  request.client.from = () => { throw new Error("Unconfirmed identity must not query client data"); };
  const result = await modules.authorize.authorizePortalClient(request);
  assert.deepEqual(result, { status: "ineligible", reason: "unconfirmed" });
});

test("forged token signature is rejected by the real provider", async () => {
  const parts = sessions["active-a"].access_token.split(".");
  const forged = { ...sessions["active-a"], access_token: `${parts[0]}.${parts[1]}.invalid_signature` };
  assert.equal((await authorize(cookieHeader(forged))).status, "ineligible");
});

test("duplicates, incomplete/gapped/malformed chunks and invalid encodings fail closed", async () => {
  const valid = cookieHeader(sessions["active-a"], 2000);
  const parts = valid.split("; ");
  const base = configuration.cookieName;
  const cases = [
    `${parts[0]}; ${parts[0]}`,
    parts.slice(1).join("; "),
    parts.slice(0,1).join("; "),
    valid.replace(`${base}.1=`, `${base}.2=`),
    valid.replace(`${base}.0=`, `${base}.00=`),
    `${base}=base64-e30; ${valid}`,
    `${base}=base64-e30`,
    `${base}=%invalid`,
    `${base}=base64-_w`,
  ];
  for (const header of cases) {
    assert.equal((await authorize(header)).status, "ineligible");
    const state = modules.cookies.createAuthCookieState(header, base);
    assert.equal(state.malformed, true);
    assert.equal(state.getAll().length, 0);
    assert.ok(state.pendingWrites().every(write => write.options.maxAge === 0));
  }
});

test("valid chunks retain SDK session behavior", async () => {
  assert.equal((await authorize(cookieHeader(sessions["active-a"], 1000))).status, "authorized");
});

test("cookie normalization enforces security while retaining expiry and deletion writes", () => {
  const expires = new Date(0);
  const options = modules.cookies.secureCookieOptions({ domain: "example.com", httpOnly: false, sameSite: "none", path: "/bad", maxAge: 0, expires }, true);
  assert.deepEqual(options, { httpOnly: true, sameSite: "lax", path: "/", secure: true, maxAge: 0, expires });
  assert.equal(modules.cookies.secureCookieOptions({ maxAge: 123 }, false).maxAge, 123);
  assert.equal(modules.cookies.secureCookieOptions({}, false).secure, false);
});

test("revoked session cannot authorize unexpired JWT while independent session remains valid", async () => {
  const first = await signIn();
  const second = await signIn();
  assert.equal((await authorize(cookieHeader(first.session))).status, "authorized");
  const revoked = await first.client.auth.signOut({ scope: "local" });
  assert.equal(revoked.error, null);
  assert.ok(first.session.expires_at > Date.now()/1000);
  assert.equal((await authorize(cookieHeader(first.session))).status, "ineligible");
  assert.equal((await authorize(cookieHeader(second.session))).status, "authorized");
});

test("request-scoped clients isolate sequential and concurrent identities", async () => {
  const first = modules.client.createRequestSupabaseClient(cookieHeader(sessions["active-a"]), undefined, environment);
  const second = modules.client.createRequestSupabaseClient(cookieHeader(sessions["active-b"]), undefined, environment);
  assert.notEqual(first.client, second.client);
  for (const key of ["active-a", "active-b", "active-a"]) assert.equal((await authorize(cookieHeader(sessions[key]))).user.id, fixtures[key].id);
  const concurrent = await Promise.all(["active-a", "active-b", "active-a", "active-b"].map(key => authorize(cookieHeader(sessions[key]))));
  concurrent.forEach((result, index) => assert.equal(result.user.id, fixtures[index%2 ? "active-b" : "active-a"].id));
});

test("missing/invalid configuration rejects privileged keys with generic errors", () => {
  for (const invalid of [{}, { SUPABASE_URL: context.url }, { ...environment, SUPABASE_PUBLISHABLE_KEY: "sb_secret_synthetic" }, { ...environment, SUPABASE_URL: "http://remote.example.com" }]) {
    assert.throws(() => modules.client.createRequestSupabaseClient(null, undefined, invalid), error => error.name === "SupabaseConfigurationError" && error.message === "Client authentication configuration is unavailable.");
  }
  const ipv6 = modules.config.getSupabaseConfiguration({ ...environment, SUPABASE_URL: "http://[::1]:55321" });
  assert.match(ipv6.cookieName, /^[A-Za-z0-9_-]+$/);
});

test("provider failure is unavailable, never anonymous authorization or SQLite fallback", async () => {
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  const diagnostics = [];
  console.error = (...values) => diagnostics.push(values);
  try {
    for (const failingFetch of [
      async () => new Response('{"message":"Unavailable"}', { status: 503, headers: { "Content-Type": "application/json" } }),
      async () => { throw new Error("Synthetic network failure"); },
    ]) {
      globalThis.fetch = failingFetch;
      assert.deepEqual(await authorize(cookieHeader(sessions["active-a"])), { status: "unavailable", reason: "provider" });
    }
    assert.equal(diagnostics.length, 0, "Provider failure must not emit credential-bearing SDK diagnostics");
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalError;
  }
});

test("middleware matches only portal, never acts as approval/ownership authorization", async () => {
  const { NextRequest } = await import("next/server.js");
  assert.deepEqual(build.require("middleware.js").config.matcher, ["/portal/:path*"]);
  for (const pathname of ["/portal", "/portal/", "/portal/nested/page"]) assert.equal(modules.middleware.isPortalPath(pathname), true);
  for (const pathname of ["/", "/contact", "/api/contact", "/portal-other", "/admin"]) {
    const response = await modules.middleware.updatePortalSession(new NextRequest(`http://localhost:3000${pathname}`));
    assert.equal(response.headers.get("x-middleware-next"), "1");
    assert.equal(response.headers.get("Cache-Control"), null);
    assert.equal(response.cookies.getAll().length, 0);
  }
  for (const header of [null, cookieHeader(sessions.pending), cookieHeader(sessions.suspended)]) {
    const response = await modules.middleware.updatePortalSession(new NextRequest("http://localhost:3000/portal", { headers: header ? { cookie: header } : {} }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-middleware-next"), "1");
    assert.equal(response.headers.get("location"), null);
    assert.ok(response.headers.get("Cache-Control").includes("no-store"));
  }
});

test("middleware propagates refreshed cookies to request and browser; no tokens in body", async () => {
  const { NextRequest } = await import("next/server.js");
  const expired = await expiredSessionFixture();
  const oldHeader = cookieHeader(expired, 500);
  const response = await modules.middleware.updatePortalSession(new NextRequest("http://localhost:3000/portal", { headers: { cookie: `${oldHeader}; unrelated=preserved` } }));
  assert.equal(response.status, 200);
  const downstream = response.headers.get("x-middleware-request-cookie");
  assert.ok(downstream && downstream.includes("unrelated=preserved"));
  assert.ok(downstream !== `${oldHeader}; unrelated=preserved`);
  const cookies = response.cookies.getAll();
  assert.ok(cookies.some(cookie => Boolean(cookie.value)));
  assert.ok(cookies.some(cookie => cookie.maxAge === 0), "Refresh must remove obsolete session chunks");
  assert.ok(cookies.every(cookie => cookie.httpOnly && cookie.sameSite === "lax" && cookie.path === "/" && !cookie.domain));
  assert.equal((await authorize(downstream)).status, "authorized");
  assert.equal(await response.text(), "");
});

test("read-only rendering refuses authorization if it would lose a refresh cookie write", async () => {
  const expired = await expiredSessionFixture();
  assert.deepEqual(await authorize(cookieHeader(expired)), { status: "unavailable", reason: "cookie-persistence" });
});

test("middleware configuration/provider failures return generic noncacheable 503", async () => {
  const { NextRequest } = await import("next/server.js");
  const saved = process.env.SUPABASE_URL;
  delete process.env.SUPABASE_URL;
  try {
    const response = await modules.middleware.updatePortalSession(new NextRequest("http://localhost:3000/portal"));
    assert.equal(response.status, 503);
    assert.equal(await response.text(), "Client authentication is temporarily unavailable.");
  } finally {
    process.env.SUPABASE_URL = saved;
  }
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("{}", { status: 503 });
  try {
    const response = await modules.middleware.updatePortalSession(new NextRequest("http://localhost:3000/portal", { headers: { cookie: cookieHeader(sessions["active-a"]) } }));
    assert.equal(response.status, 503);
    assert.ok(response.headers.get("Cache-Control").includes("no-store"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("cache policy preserves other response/security headers", () => {
  const headers = new Headers({ "X-Frame-Options": "SAMEORIGIN", Vary: "RSC", "Cache-Control": "public" });
  modules.cache.setPrivateNoStore(headers);
  assert.equal(headers.get("X-Frame-Options"), "SAMEORIGIN");
  assert.equal(headers.get("Vary"), "RSC, Cookie");
  assert.equal(headers.get("Cache-Control"), "private, no-store, max-age=0");
});

test("production Next.js 14 middleware and Server Component integration remains isolated from project UI", async () => {
  origin = await build.start(environment);
  const anonymous = await fetch(`${origin}/portal`);
  assert.equal(anonymous.status, 200);
  assert.ok((await anonymous.text()).includes('ineligible'));
  const active = await fetch(`${origin}/portal`, { headers: { cookie: cookieHeader(sessions["active-a"]) } });
  const body = await active.text();
  assert.equal(active.status, 200);
  assert.ok(body.includes(fixtures["active-a"].id));
  assert.ok(!body.includes(sessions["active-a"].access_token) && !body.includes(sessions["active-a"].refresh_token));
  assert.ok(active.headers.get("Cache-Control").includes("private"));
  assert.ok(active.headers.get("Cache-Control").includes("no-store"));
  assert.equal(active.headers.get("X-Frame-Options"), "SAMEORIGIN");
  assert.equal(active.headers.get("x-middleware-request-cookie"), null);
  const other = await fetch(`${origin}/portal`, { headers: { cookie: cookieHeader(sessions["active-b"]) } });
  const otherBody = await other.text();
  assert.ok(otherBody.includes(fixtures["active-b"].id) && !otherBody.includes(fixtures["active-a"].id));
  const expired = await expiredSessionFixture();
  const refreshed = await fetch(`${origin}/portal`, { headers: { cookie: cookieHeader(expired) } });
  const refreshedBody = await refreshed.text();
  assert.equal(refreshed.status, 200);
  assert.ok(refreshedBody.includes(fixtures["active-a"].id));
  assert.ok(refreshed.headers.get("Set-Cookie")?.includes("HttpOnly"));
  assert.ok(refreshed.headers.get("Set-Cookie")?.includes("Secure"));
  assert.ok(refreshed.headers.get("Cache-Control").includes("no-store"));
  const malformed = await fetch(`${origin}/portal`, { headers: { cookie: `${configuration.cookieName}=base64-e30` } });
  assert.ok((await malformed.text()).includes("ineligible"));
  assert.ok(malformed.headers.get("Set-Cookie")?.includes("Max-Age=0"));
  const outside = await fetch(`${origin}/outside`, { headers: { cookie: cookieHeader(sessions["active-a"]) } });
  assert.equal(outside.status, 200);
  assert.equal(outside.headers.get("Set-Cookie"), null);
});
