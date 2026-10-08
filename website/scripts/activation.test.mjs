import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test, { after, before } from "node:test";
import { Webhook } from "standardwebhooks";
import { emailConfiguration, sendRecoveryEmail } from "../../supabase/functions/send-recovery-email/core.mjs";
import { issueDevInvitation, invitationInput, invitationMarker } from "./invite-client-dev.mjs";
import { redactRecoveryLog } from "./dev.mjs";
import { sessionTestBuild } from "./lib/session-test-build.mjs";

const origin = "http://localhost:3000";
const hash = "b".repeat(64);
const secret = randomBytes(32).toString("base64");
const environment = { EMAILJS_SERVICE_ID: "synthetic-service", EMAILJS_TEMPLATE_ID: "synthetic-recovery-template",
  EMAILJS_INVITE_TEMPLATE_ID: "synthetic-invite-template", EMAILJS_PUBLIC_KEY: "synthetic-public", EMAILJS_PRIVATE_KEY: "synthetic-private",
  SEND_EMAIL_HOOK_SECRET: `v1,whsec_${secret}`, RECOVERY_ALLOWED_ORIGINS: origin, ACTIVATION_ALLOWED_ORIGINS: origin };
const config = emailConfiguration(name => environment[name]);

function hookRequest(changes = {}, userChanges = {}, stale = false) {
  const timestamp = new Date(Date.now() - (stale ? 600_000 : 0));
  const payload = JSON.stringify({ user: { email: "invite@example.invalid", email_confirmed_at: null,
    app_metadata: { taxtrax_client_invitation: invitationMarker }, ...userChanges }, email_data: {
    email_action_type: "invite", token_hash: hash, redirect_to: `${origin}/api/auth/activation/callback`, ...changes } });
  return new Request("https://synthetic.example.invalid/hook", { method: "POST", headers: {
    "webhook-id": "synthetic-invite", "webhook-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
    "webhook-signature": new Webhook(secret).sign("synthetic-invite", timestamp, payload) }, body: payload });
}

test("signed invite uses a separate template and only recipient/activation-link parameters", async () => {
  let sent;
  const result = await sendRecoveryEmail(hookRequest(), config, Webhook, async (url, options) => { sent = { url, body: JSON.parse(options.body) }; return new Response("OK"); });
  assert.equal(result.status, 200);
  assert.equal(sent.url, "https://api.emailjs.com/api/v1.0/email/send");
  assert.equal(sent.body.template_id, environment.EMAILJS_INVITE_TEMPLATE_ID);
  assert.deepEqual(Object.keys(sent.body.template_params).sort(), ["activation_url", "to_email"]);
  assert.equal(new URL(sent.body.template_params.activation_url).searchParams.get("type"), "invite");
  assert.equal(new URL(sent.body.template_params.activation_url).searchParams.get("token_hash"), hash);
  assert.equal(await result.text(), "{}");
});

test("invites require signed, unconfirmed, owner-marked identities and exact redirects", async () => {
  let deliveries = 0;
  const deliver = async () => { deliveries++; return new Response("OK"); };
  for (const [changes, userChanges] of [[{ email_action_type: "signup" }, {}], [{ redirect_to: `${origin}/api/auth/recovery/callback` }, {}],
    [{ redirect_to: "https://unapproved.example.invalid/api/auth/activation/callback" }, {}], [{ redirect_to: `${origin}/api/auth/activation/callback?next=other` }, {}],
    [{ token_hash: "bad" }, {}], [{}, { email_confirmed_at: new Date().toISOString() }], [{}, { app_metadata: {}, user_metadata: { taxtrax_client_invitation: invitationMarker } }]]) {
    assert.equal((await sendRecoveryEmail(hookRequest(changes, userChanges), config, Webhook, deliver)).status, 400);
  }
  assert.equal((await sendRecoveryEmail(hookRequest({}, {}, true), config, Webhook, deliver)).status, 401);
  const forged = hookRequest(); forged.headers.set("webhook-signature", "v1,forged");
  assert.equal((await sendRecoveryEmail(forged, config, Webhook, deliver)).status, 401);
  assert.equal(deliveries, 0);
});

test("missing/invalid invitation configuration does not break recovery delivery", async () => {
  for (const changes of [{ EMAILJS_INVITE_TEMPLATE_ID: undefined }, { EMAILJS_INVITE_TEMPLATE_ID: environment.EMAILJS_TEMPLATE_ID },
    { ACTIVATION_ALLOWED_ORIGINS: undefined }, { ACTIVATION_ALLOWED_ORIGINS: "not-an-origin" }]) {
    const configured = emailConfiguration(name => ({ ...environment, ...changes })[name]);
    assert.equal((await sendRecoveryEmail(hookRequest(), configured, Webhook, () => { throw new Error("Must not send invite"); })).status, 503);
    let sent;
    const recovery = await sendRecoveryEmail(hookRequest({ email_action_type: "recovery", redirect_to: `${origin}/api/auth/recovery/callback` },
      { email_confirmed_at: new Date().toISOString() }), configured, Webhook, async (url, options) => { sent = JSON.parse(options.body); return new Response("OK"); });
    assert.equal(recovery.status, 200);
    assert.equal(sent.template_id, environment.EMAILJS_TEMPLATE_ID);
    assert.deepEqual(Object.keys(sent.template_params).sort(), ["recovery_url", "to_email"]);
  }
});

test("invite delivery failures and dev logs do not expose proofs or provider messages", async () => {
  const result = await sendRecoveryEmail(hookRequest(), config, Webhook, async () => new Response(`private ${hash} ${secret}`, { status: 403 }));
  assert.equal(result.status, 503);
  const body = await result.text();
  for (const value of [hash, secret, environment.EMAILJS_PRIVATE_KEY, "private"]) assert.ok(!body.includes(value));
  assert.equal(redactRecoveryLog(`GET /api/auth/activation/callback?token_hash=${hash}&type=invite 303`), "GET /api/auth/activation/callback?[redacted] 303");
});

function ownerMock({ profileFailure = false, sendFailure = false, existing } = {}) {
  const records = new Map();
  const profiles = new Map();
  const calls = [];
  if (existing) { records.set(existing.id, existing); profiles.set(existing.id, { user_id: existing.id, name: "Synthetic Invited Client", status: existing.status ?? "active" }); }
  const admin = { auth: { admin: {
    listUsers: async () => ({ data: { users: [...records.values()] }, error: null }),
    createUser: async input => { calls.push(["create", input]); const user = { ...input, id: "new-synthetic-user" }; records.set(user.id, user); return { data: { user }, error: null }; },
    getUserById: async userId => ({ data: { user: records.get(userId) }, error: null }),
    deleteUser: async userId => { calls.push(["delete", userId]); records.delete(userId); profiles.delete(userId); return { error: null }; },
    inviteUserByEmail: async (email, options) => { const user = [...records.values()].find(item => item.email === email); calls.push(["invite", options]); assert.equal(profiles.get(user.id).status, "active"); return { data: { user }, error: sendFailure ? { message: "private" } : null }; },
  } }, from: table => {
    assert.equal(table, "client_profiles");
    return {
      insert: async input => { calls.push(["profile", input]); if (!profileFailure) profiles.set(input.user_id, { ...input }); return { error: profileFailure ? {} : null }; },
      update: input => ({ eq: (column, userId) => ({ select: () => ({ single: async () => { calls.push(["approve"]); Object.assign(profiles.get(userId), input); return { data: profiles.get(userId), error: null }; } }) }) }),
      select: () => ({ eq: (column, userId) => ({ single: async () => ({ data: profiles.get(userId), error: null }) }) }),
    };
  } };
  return { admin, records, profiles, calls };
}

const approvedInput = { email: "invite@example.invalid", name: "Synthetic Invited Client", approved: true, synthetic: true };
test("owner provisioning approves before invite without confirming email or choosing a client password", async () => {
  const mock = ownerMock();
  assert.deepEqual(await issueDevInvitation(mock.admin, "create", approvedInput), { ok: true });
  assert.deepEqual(mock.calls.map(item => item[0]), ["create", "profile", "approve", "invite"]);
  assert.equal(mock.calls[0][1].email_confirm, false);
  assert.equal(mock.calls[0][1].password, undefined);
  assert.equal(mock.calls.at(-1)[1].redirectTo, `${origin}/api/auth/activation/callback`);
});

test("owner tool fails closed for other projects, public/unapproved input and extra fields", async () => {
  for (const input of [{ ...approvedInput, approved: false }, { ...approvedInput, synthetic: false }, { ...approvedInput, role: "admin" },
    { ...approvedInput, name: " untrimmed " }, { ...approvedInput, name: "control\nname" }, { ...approvedInput, email: "invalid" }]) {
    assert.throws(() => invitationInput("create", input));
  }
  await assert.rejects(issueDevInvitation(ownerMock().admin, "create", approvedInput, "not-approved-dev"));
});

test("profile failure rolls back only newly created identity and never sends invite", async () => {
  const mock = ownerMock({ profileFailure: true });
  await assert.rejects(issueDevInvitation(mock.admin, "create", approvedInput));
  assert.equal(mock.records.size, 0);
  assert.ok(!mock.calls.some(item => item[0] === "invite"));
});

test("explicit resend preserves approval; existing confirmed/unmarked/inactive identities are refused", async () => {
  const existing = { id: "existing-synthetic", email: approvedInput.email, app_metadata: { taxtrax_client_invitation: invitationMarker } };
  const mock = ownerMock({ existing });
  await assert.rejects(issueDevInvitation(mock.admin, "create", approvedInput));
  assert.deepEqual(await issueDevInvitation(mock.admin, "resend", { email: existing.email, synthetic: true }), { ok: true });
  assert.deepEqual(mock.calls.map(item => item[0]), ["invite"]);
  for (const changed of [{ ...existing, email_confirmed_at: new Date().toISOString() }, { ...existing, app_metadata: {} },
    { ...existing, status: "pending" }, { ...existing, status: "suspended" }]) {
    const refused = ownerMock({ existing: changed });
    await assert.rejects(issueDevInvitation(refused.admin, "resend", { email: existing.email, synthetic: true }));
    assert.equal(refused.calls.length, 0);
  }
});

test("unconfirmed approved identity is retained after unconfirmed email delivery failure", async () => {
  const mock = ownerMock({ sendFailure: true });
  await assert.rejects(issueDevInvitation(mock.admin, "create", approvedInput));
  assert.equal(mock.records.size, 1);
  assert.equal(mock.profiles.get("new-synthetic-user").status, "active");
  assert.ok(!mock.calls.some(item => item[0] === "delete"));
});

let build;
let activation;
let clientModule;
let originalClient;
let oldEnvironment;
let user;
let profile;
let verifiedError;
let updates;
let signOuts;
let signOutStatus;
let providerError;
let updateError;
const family = "sb-dbcakdqthnamgjfkkxzn-auth-token-activation";
const sessionValue = `base64-${Buffer.from(JSON.stringify({ access_token: "synthetic.header.signature", refresh_token: "synthetic_refresh",
  expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: "synthetic-user" } })).toString("base64url")}`;

before(async () => {
  oldEnvironment = { AUTH_ORIGIN: process.env.AUTH_ORIGIN, SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY };
  Object.assign(process.env, { AUTH_ORIGIN: origin, SUPABASE_URL: "https://dbcakdqthnamgjfkkxzn.supabase.co", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic" });
  build = await sessionTestBuild(["lib/auth/activation.ts", "lib/auth/request.ts", "lib/validation.ts"]);
  activation = build.require("lib/auth/activation.js");
  clientModule = build.require("lib/supabase/client.js");
  originalClient = clientModule.createRequestSupabaseClient;
});
after(async () => {
  if (clientModule) clientModule.createRequestSupabaseClient = originalClient;
  for (const [key, value] of Object.entries(oldEnvironment ?? {})) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  await build?.stop();
});

function request(body = {}, headers = {}) {
  return new Request(`${origin}/api/auth/activation/verify`, { method: "POST", headers: {
    Origin: origin, "Content-Type": "application/json", "X-TaxTrax-Auth": "1", Cookie: `taxtrax-activation-link=${hash}`, ...headers,
  }, body: typeof body === "string" ? body : JSON.stringify(body) });
}
function mockSession() {
  user = { id: "synthetic-user", email: "invite@example.invalid", email_confirmed_at: new Date().toISOString(), invited_at: new Date().toISOString(), app_metadata: { taxtrax_client_invitation: invitationMarker } };
  profile = { user_id: user.id, name: "Synthetic Invited Client", status: "active" };
  verifiedError = null; updates = []; signOuts = []; signOutStatus = 200; providerError = null; updateError = null;
  clientModule.createRequestSupabaseClient = (header, writer, environment, observe, purpose) => {
    assert.equal(purpose, "activation");
    const state = build.require("lib/supabase/cookies.js").createAuthCookieState(header, family);
    let signed = state.getAll().length > 0;
    return { state, writable: Boolean(writer), client: { auth: {
      verifyOtp: async input => { assert.deepEqual(input, { token_hash: hash, type: "invite" }); if (!verifiedError) { signed = true; state.setAll([{ name: family, value: sessionValue, options: {} }]); } return { error: verifiedError }; },
      getUser: async () => ({ data: { user: signed ? user : null }, error: providerError }),
      updateUser: async input => { updates.push(input); return { error: updateError }; },
      signOut: async input => { signOuts.push(input); observe?.(signOutStatus, false); signed = false; return { error: signOutStatus === 200 ? null : { status: signOutStatus } }; },
    }, from: table => { assert.equal(table, "client_profiles"); return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profile, error: null }) }) }) }; } } };
  };
}

test("setup POST routes enforce CSRF/body/exact-field boundary", async () => {
  for (const handler of [activation.verifyInvitation, activation.setFirstPassword]) {
    for (const [headers, status] of [[{ Origin: "null" }, 403], [{ Origin: "http://localhost:3001" }, 403],
      [{ "X-TaxTrax-Auth": "0" }, 403], [{ "Sec-Fetch-Site": "cross-site" }, 403], [{ "Content-Type": "text/plain" }, 415]]) {
      assert.equal((await handler(request({}, headers))).status, status);
    }
    assert.equal((await handler(request("{"))).status, 400);
    assert.equal((await handler(request("x".repeat(4097)))).status, 413);
    assert.equal((await handler(request({ user_id: "other-user", status: "active" }))).status, 400);
  }
});

test("callback stages HttpOnly invite proof without verification or caller-controlled navigation", async () => {
  clientModule.createRequestSupabaseClient = () => { throw new Error("GET must not verify proof"); };
  const response = await activation.activationCallback(new Request(`${origin}/api/auth/activation/callback?token_hash=${hash}&type=invite`));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), `${origin}/portal/activate`);
  assert.match(response.headers.get("cache-control"), /no-store/);
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  const cookie = response.cookies.get("taxtrax-activation-link");
  assert.equal(cookie.httpOnly, true); assert.equal(cookie.sameSite, "lax"); assert.equal(cookie.path, "/api/auth/activation");
  for (const query of [`token_hash=${hash}&type=recovery`, `token_hash=${hash}&type=invite&next=other`, `token_hash=${hash}&token_hash=${hash}&type=invite`, "token_hash=bad&type=invite"]) {
    const invalid = await activation.activationCallback(new Request(`${origin}/api/auth/activation/callback?${query}`));
    assert.equal(invalid.headers.get("location"), `${origin}/portal/activate?invalid=1`);
    assert.equal(invalid.cookies.get("taxtrax-activation-link").value, "");
  }
});

test("missing/duplicate/expired/used invite proof fails closed", async () => {
  mockSession();
  for (const Cookie of ["", "taxtrax-activation-link=bad", `taxtrax-activation-link=${hash}; taxtrax-activation-link=${hash}`]) {
    assert.equal((await activation.verifyInvitation(request({}, { Cookie }))).status, 401);
  }
  verifiedError = { status: 403, message: "private provider message" };
  const result = await activation.verifyInvitation(request());
  assert.equal(result.status, 401);
  assert.ok(!(await result.text()).includes("private provider"));
  assert.equal(result.cookies.get(family), undefined);
});

test("verified invite commits only setup cookies and does not alter approval", async () => {
  mockSession();
  const result = await activation.verifyInvitation(request());
  assert.equal(result.status, 200); assert.deepEqual(await result.json(), { ok: true });
  assert.equal(result.cookies.get(family).value, sessionValue);
  assert.equal(result.cookies.get("sb-dbcakdqthnamgjfkkxzn-auth-token"), undefined);
  assert.equal(result.cookies.get("sb-dbcakdqthnamgjfkkxzn-auth-token-recovery"), undefined);
  assert.equal(profile.status, "active"); assert.equal(updates.length, 0);
});

test("ineligible or unmarked identity never receives a usable setup browser session", async () => {
  for (const change of [() => { profile = null; }, () => { profile.status = "pending"; }, () => { profile.status = "suspended"; },
    () => { profile.user_id = "another-user"; }, () => { user.email_confirmed_at = null; }, () => { user.app_metadata = {}; }, () => { user.invited_at = null; }]) {
    mockSession(); change();
    const result = await activation.verifyInvitation(request());
    assert.equal(result.status, 401); assert.equal(result.cookies.get(family), undefined);
    assert.deepEqual(signOuts, [{ scope: "local" }]);
  }
});

test("first password validates exact bytes, signs out, clears cookies and requires fresh login", async () => {
  mockSession();
  const Cookie = `${family}=${sessionValue}`;
  for (const [password, confirm] of [["short1", "short1"], ["password123", "password123"], ["invite-good-pass42", "invite-good-pass42"], ["Safe-first-password42", "different"]]) {
    assert.equal((await activation.setFirstPassword(request({ password, confirm }, { Cookie }))).status, 400);
  }
  assert.equal(updates.length, 0);
  const password = "  Safe-first-password42!  ";
  const result = await activation.setFirstPassword(request({ password, confirm: password }, { Cookie }));
  assert.equal(result.status, 200); assert.deepEqual(await result.json(), { ok: true });
  assert.deepEqual(updates, [{ password }]); assert.deepEqual(signOuts, [{ scope: "global" }]);
  assert.equal(profile.status, "active"); assert.equal(result.cookies.get(family).value, "");
  assert.equal(result.cookies.get("sb-dbcakdqthnamgjfkkxzn-auth-token").value, "");
});

test("normal/recovery/forged cookies cannot set first password; provider failure stays generic", async () => {
  mockSession();
  for (const Cookie of [`sb-dbcakdqthnamgjfkkxzn-auth-token=${sessionValue}`, `sb-dbcakdqthnamgjfkkxzn-auth-token-recovery=${sessionValue}`, `${family}.0=bad; ${family}.2=bad`]) {
    assert.equal((await activation.setFirstPassword(request({ password: "Safe-first-password42", confirm: "Safe-first-password42" }, { Cookie }))).status, 401);
  }
  assert.equal(updates.length, 0);
  signOutStatus = 503;
  const result = await activation.setFirstPassword(request({ password: "Safe-first-password42", confirm: "Safe-first-password42" }, { Cookie: `${family}=${sessionValue}` }));
  assert.equal(result.status, 503); assert.equal(result.cookies.get(family).value, "");
  assert.deepEqual(signOuts, [{ scope: "global" }]);
});

test("configuration/provider failures fail closed without raw errors or partial setup cookies", async () => {
  mockSession();
  providerError = { status: 503, message: "private provider detail" };
  const failed = await activation.verifyInvitation(request());
  assert.equal(failed.status, 503); assert.equal(failed.cookies.get(family), undefined);
  assert.ok(!(await failed.text()).includes("private provider"));
  mockSession();
  updateError = { status: 503, message: "private provider detail" };
  const update = await activation.setFirstPassword(request({ password: "Safe-first-password42", confirm: "Safe-first-password42" }, { Cookie: `${family}=${sessionValue}` }));
  assert.equal(update.status, 503); assert.ok(!(await update.text()).includes("private provider")); assert.equal(signOuts.length, 0);
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  try {
    clientModule.createRequestSupabaseClient = originalClient;
    delete process.env.SUPABASE_PUBLISHABLE_KEY;
    const missing = await activation.verifyInvitation(request());
    assert.equal(missing.status, 503); assert.equal(missing.cookies.get(family), undefined);
  } finally { process.env.SUPABASE_PUBLISHABLE_KEY = key; }
});
