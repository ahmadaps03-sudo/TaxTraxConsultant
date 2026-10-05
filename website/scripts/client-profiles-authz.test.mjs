import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test, { after, before } from "node:test";
import { fixturePassword, localFixtureContext, provisionFixtures, removeTestFixtures } from "./lib/supabase-fixtures.mjs";
import { databaseTestQuery, withAuthenticatedClaims } from "./lib/local-database-test.mjs";

let context;
let fixtures;
const namespace = randomUUID();
const sessions = {};

function claimsOf(token) {
  return JSON.parse(Buffer.from(token.split(".")[1], "base64url"));
}

async function profileRequest(session, method = "GET", query = "", body, schema = "public") {
  const headers = { apikey: context.publishableKey, "Content-Type": "application/json", "Accept-Profile": schema, "Content-Profile": schema };
  if (session) headers.Authorization = `Bearer ${session.access_token}`;
  const response = await fetch(`${context.url}/rest/v1/client_profiles${query}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: "error", signal: AbortSignal.timeout(10_000) });
  return { status: response.status, body: await response.json().catch(() => undefined) };
}

async function rowsFor(session, query = "?select=user_id,name,status") {
  const result = await profileRequest(session, "GET", query);
  assert.equal(result.status, 200, "Client profile request must reach RLS successfully");
  assert.ok(Array.isArray(result.body));
  return result.body;
}

before(async () => {
  context = await localFixtureContext();
  fixtures = await provisionFixtures(context, namespace);
  for (const key of ["active-a", "active-b", "pending", "suspended", "no-profile"]) {
    const client = context.client();
    const result = await client.auth.signInWithPassword({ email: fixtures[key].email, password: fixturePassword });
    assert.equal(result.error, null, "Synthetic sign-in setup failed");
    sessions[key] = { ...result.data.session, client };
  }
});

after(async () => {
  if (context) await removeTestFixtures(context, namespace);
});

test("effective database grants, helper privileges, schema and constraints", async () => {
  const sql = await readFile(new URL("../../supabase/tests/client_profiles.test.sql", import.meta.url), "utf8");
  const output = await databaseTestQuery(`\\set fixture_no_profile '${fixtures["no-profile"].id}'\n${sql}`);
  assert.doesNotMatch(output, /^not ok/m, "Database pgTAP assertions failed");
  const plan = output.match(/^1\.\.(\d+)$/m);
  assert.ok(plan, "Database test plan is required");
  assert.equal(output.match(/^ok \d+/gm)?.length, Number(plan[1]));
  console.log(`Database assertions passed: ${plan[1]}`);
});

test("anon cannot read client_profiles", async () => {
  const result = await profileRequest();
  assert.ok([401,403].includes(result.status));
  assert.equal(result.body.code, "42501");
});

test("active A can read only its own active profile", async () => {
  const rows = await rowsFor(sessions["active-a"]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].user_id, fixtures["active-a"].id);
  assert.equal(rows[0].status, "active");
});

test("active A cannot read B, including arbitrary identity filters", async () => {
  assert.deepEqual(await rowsFor(sessions["active-a"], `?user_id=eq.${fixtures["active-b"].id}&select=user_id`), []);
  assert.deepEqual(await rowsFor(sessions["active-a"], `?user_id=eq.${randomUUID()}&select=user_id`), []);
});

test("active B can read B but cannot read A", async () => {
  const rows = await rowsFor(sessions["active-b"]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].user_id, fixtures["active-b"].id);
  assert.deepEqual(await rowsFor(sessions["active-b"], `?user_id=eq.${fixtures["active-a"].id}&select=user_id`), []);
});

for (const key of ["pending", "suspended", "no-profile"]) {
  test(`${key} identity receives no authorized profile`, async () => {
    assert.deepEqual(await rowsFor(sessions[key]), []);
  });
}

for (const [method, description, body] of [
  ["POST", "INSERT", () => ({ user_id: randomUUID(), name: "Forged Synthetic Profile", status: "active" })],
  ["PATCH", "UPDATE", () => ({ name: "Attempted Synthetic Update", status: "active" })],
  ["DELETE", "DELETE", () => undefined],
]) {
  test(`authenticated client cannot ${description} client_profiles`, async () => {
    const result = await profileRequest(sessions["active-a"], method, `?user_id=eq.${fixtures["active-a"].id}`, body());
    assert.equal(result.status, 403);
    assert.equal(result.body.code, "42501");
    assert.equal((await rowsFor(sessions["active-a"]))[0].name, "Synthetic Client A");
  });
}

test("pending client cannot self-promote to active", async () => {
  const result = await profileRequest(sessions.pending, "PATCH", `?user_id=eq.${fixtures.pending.id}`, { status: "active" });
  assert.equal(result.status, 403);
  assert.deepEqual(await rowsFor(sessions.pending), []);
});

test("forged JWT identity cannot bypass gateway validation or RLS", async () => {
  const parts = sessions["active-a"].access_token.split(".");
  const forgedClaims = { ...claimsOf(sessions["active-a"].access_token), sub: fixtures["active-b"].id };
  const forgedToken = `${parts[0]}.${Buffer.from(JSON.stringify(forgedClaims)).toString("base64url")}.${parts[2]}`;
  const result = await profileRequest({ access_token: forgedToken });
  assert.equal(result.status, 401);
  assert.ok(!Array.isArray(result.body));
});

test("private and auth schemas are not exposed through PostgREST", async () => {
  for (const schema of ["private", "auth"]) {
    const result = await profileRequest(sessions["active-a"], "GET", "", undefined, schema);
    assert.equal(result.status, 406);
    assert.equal(result.body.code, "PGRST106");
  }
});

test("helper rejects absent, malformed, nonexistent, and mismatched identities", async () => {
  const valid = claimsOf(sessions["active-a"].access_token);
  const other = claimsOf(sessions["active-b"].access_token);
  const cases = [
    {},
    { sub: valid.sub },
    { session_id: valid.session_id },
    { sub: valid.sub, session_id: "not-a-uuid" },
    { sub: valid.sub, session_id: null },
    { sub: valid.sub, session_id: [valid.session_id] },
    { sub: valid.sub, session_id: { id: valid.session_id } },
    { sub: valid.sub, session_id: randomUUID() },
    { sub: valid.sub, session_id: other.session_id },
  ];
  for (const claims of cases) {
    assert.equal(await withAuthenticatedClaims({ role: "authenticated", ...claims }, "select private.client_session_is_live()::text || '|' || (select count(*) from public.client_profiles)::text || '|' || current_user"), "false|0|authenticated");
  }
  assert.equal(await withAuthenticatedClaims(valid, "select private.client_session_is_live()::text || '|' || (select count(*) from public.client_profiles)::text || '|' || current_user"), "true|1|authenticated");
});

test("provider local logout blocks unexpired JWT replay but preserves an independent session", async () => {
  const first = sessions["active-a"];
  const secondClient = context.client();
  const second = await secondClient.auth.signInWithPassword({ email: fixtures["active-a"].email, password: fixturePassword });
  assert.equal(second.error, null);
  const originalClaims = claimsOf(first.access_token);
  const otherClaims = claimsOf(second.data.session.access_token);
  assert.notEqual(originalClaims.session_id, otherClaims.session_id);
  assert.equal((await rowsFor(first)).length, 1);
  try {
    const revoked = await first.client.auth.signOut({ scope: "local" });
    assert.equal(revoked.error, null);
    assert.ok(originalClaims.exp > Math.floor(Date.now()/1000));
    assert.deepEqual(await rowsFor(first), []);
    assert.equal((await rowsFor(second.data.session))[0].user_id, fixtures["active-a"].id);
    assert.equal(await withAuthenticatedClaims(originalClaims, "select private.client_session_is_live()::text"), "false");
    assert.equal(await withAuthenticatedClaims(otherClaims, "select private.client_session_is_live()::text"), "true");
  } finally {
    await secondClient.auth.signOut({ scope: "local" });
  }
});

test("unconfirmed Auth fixture cannot sign in", async () => {
  const result = await context.client().auth.signInWithPassword({ email: fixtures.unconfirmed.email, password: fixturePassword });
  assert.equal(result.error?.code, "email_not_confirmed");
  assert.equal(result.data.session, null);
});

test("fixture provisioning is idempotent and never reactivates a suspended identity", async () => {
  const suspended = await context.admin.from("client_profiles").update({ status: "suspended" }).eq("user_id", fixtures["active-b"].id);
  assert.equal(suspended.error, null);
  try {
    const repeated = await provisionFixtures(context, namespace);
    for (const key of Object.keys(fixtures)) assert.equal(repeated[key].id, fixtures[key].id);
    assert.equal(repeated["active-b"].profile.status, "suspended");
    assert.deepEqual(await rowsFor(sessions["active-b"]), []);
  } finally {
    const restored = await context.admin.from("client_profiles").update({ status: "active" }).eq("user_id", fixtures["active-b"].id);
    assert.equal(restored.error, null);
  }
});

test("failed profile creation removes its newly provisioned Auth identity", async () => {
  const isolated = randomUUID();
  const failingAdmin = new Proxy(context.admin, { get(target, name) {
    if (name !== "from") return Reflect.get(target, name);
    return table => {
      const builder = target.from(table);
      builder.insert = () => ({ select: () => ({ single: async () => ({ error: { code: "synthetic_failure" } }) }) });
      return builder;
    };
  } });
  try {
    await assert.rejects(provisionFixtures({ ...context, admin: failingAdmin }, isolated), /newly created identities were removed/);
    const result = await context.admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    assert.equal(result.error, null);
    assert.ok(!result.data.users.some(user => user.email === `active-a.${isolated}@taxtrax.example.invalid`));
  } finally {
    await removeTestFixtures(context, isolated);
  }
});

test("provisioning refuses remote targets and unsupported namespaces", async () => {
  await assert.rejects(provisionFixtures({ ...context, url: "https://example.com" }), /local HTTP origin/);
  await assert.rejects(provisionFixtures(context, "production"), /synthetic test namespaces/);
});
