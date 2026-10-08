import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import { readFile } from "node:fs/promises";
import { reviewAccessRequests, reviewInput, reviewData, runReview } from "../../supabase/functions/review-access-requests/core.mjs";
import { devReviewProvider } from "../../supabase/functions/review-access-requests/provider.mjs";
import { adminReviewEnvironment } from "./setup-admin-access-requests-dev.mjs";
import { sessionTestBuild } from "./lib/session-test-build.mjs";

const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const userId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const secret = "synthetic_review_capability_only_1234567890123456789";
const row = { id, name: "Synthetic Reviewed Client", email: "review@example.invalid", status: "approved", provisioning_status: "processing", invitation_status: "not_attempted", provisioned_user_id: null };

test("exact actions/UUIDs and explicit DTOs exclude private operation/provider fields", () => {
  assert.deepEqual(reviewInput({ action: "list" }), { action: "list" });
  for (const action of ["detail", "approve", "reject", "resend_invite"]) assert.equal(reviewInput({ action, id }).id, id);
  for (const body of [null, [], {}, { action: "list", id }, { action: "approve", id: "bad" }, { action: "delete", id }, { action: "approve", id, status: "active" }]) assert.throws(() => reviewInput(body));
  assert.deepEqual(reviewData({ ...row, operation_token: secret, service_role: secret, access_token: secret }), row);
  assert.throws(() => reviewData(Array(51).fill(row)));
});

test("review RPC migration uses row locks/fencing, permanent decisions and service-only grants", async () => {
  const sql = await readFile(new URL("../../supabase/migrations/20261009000100_admin_access_request_review.sql", import.meta.url), "utf8");
  assert.match(sql, /security definer\s+set search_path = ''/);
  assert.match(sql, /for update/);
  assert.match(sql, /operation_token is distinct from p_operation/);
  assert.match(sql, /taxtrax_access_request_id/);
  assert.match(sql, /revoke all on function [^;]+ from public, anon, authenticated, service_role/);
  assert.match(sql, /grant execute on function [^;]+ to service_role/);
  assert.doesNotMatch(sql, /decided_by|password|token_hash/);
});

test("approval provisions marked identity/profile before inviting and does not return private state", async () => {
  const calls = [];
  const provider = {
    async rpc(action) {
      calls.push(action);
      if (action === "approve") return { code: "ok", claimed: true, data: row };
      if (action === "identity") return { code: "ok", user_id: null };
      return { code: "ok", data: { ...row, provisioning_status: "ready", provisioned_user_id: userId, invitation_status: action === "invite_sent" ? "sent" : "attempting", operation_token: secret } };
    },
    async createUser(fields) { calls.push("create"); assert.equal(fields.email_confirm, false); assert.equal(fields.app_metadata.taxtrax_access_request_id, id); return { id: userId }; },
    async invite() { calls.push("invite"); return { outcome: "sent", userId }; },
  };
  const result = await runReview({ id, action: "approve" }, provider);
  assert.equal(result.status, 200); assert.equal(result.body.data.invitation_status, "sent");
  assert.deepEqual(calls, ["approve", "identity", "create", "provision", "invite_start", "invite", "invite_sent"]);
  assert.ok(!JSON.stringify(result).includes(secret));
});

test("invitation failures and uncertain transport retain approved/provisioned state", async () => {
  for (const outcome of ["failed", "unknown"]) {
    const calls = [];
    const provider = { async rpc(action) {
      calls.push(action); return { code: "ok", claimed: action === "approve", data: { ...row, provisioning_status: "ready", provisioned_user_id: userId, invitation_status: action === `invite_${outcome}` ? outcome : "not_attempted" } };
    }, async invite() { return { outcome }; }, async createUser() { assert.fail("Ready account recreated"); } };
    const result = await runReview({ id, action: "approve" }, provider);
    assert.equal(result.status, 200); assert.equal(result.body.data.status, "approved"); assert.equal(result.body.data.invitation_status, outcome);
    assert.deepEqual(calls, ["approve", "invite_start", `invite_${outcome}`]);
  }
});

test("unrelated/confirmed identities fail closed; interrupted operations release claims safely", async () => {
  for (const code of ["ineligible", "unavailable"]) {
    const calls = [];
    const provider = { async rpc(action) {
      calls.push(action);
      if (action === "approve") return { code: "ok", claimed: true, data: row };
      if (action === "identity") return { code };
      return { code: "ok", data: row };
    }, async createUser() { assert.fail("Unsafe account creation"); }, async invite() { assert.fail("Unsafe invitation"); } };
    assert.equal((await runReview({ id, action: "approve" }, provider)).status, code === "ineligible" ? 409 : 503);
    assert.deepEqual(calls, ["approve", "identity", code === "ineligible" ? "block" : "error"]);
  }
});

test("repeated approvals/rejections and busy claims never provision or send invitations", async () => {
  for (const action of ["approve", "reject"]) {
    const provider = { async rpc() { return { code: "ok", claimed: false, data: row }; }, async createUser() { assert.fail(); }, async invite() { assert.fail(); } };
    assert.equal((await runReview({ id, action }, provider)).status, 200);
  }
  assert.equal((await runReview({ id, action: "approve" }, { async rpc() { return { code: "busy" }; } })).status, 409);
});

test("Edge requires a separate capability, exact bounded JSON and never exposes provider errors", async () => {
  let calls = 0;
  const provider = { async rpc() { calls++; throw new Error(secret); } };
  const request = (body, headers = {}) => new Request("https://synthetic.example.invalid/review", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}`, ...headers }, body });
  assert.equal((await reviewAccessRequests(request('{"action":"list"}', { Authorization: "Bearer synthetic_submission_secret_12345678901234567890" }), secret, provider)).status, 403);
  assert.equal((await reviewAccessRequests(request("{"), secret, provider)).status, 400);
  assert.equal((await reviewAccessRequests(request(" ".repeat(5000)), secret, provider)).status, 400);
  assert.equal((await reviewAccessRequests(request('{"action":"list"}', { "Content-Length": "5000" }), secret, provider)).status, 413);
  assert.equal(calls, 0);
  const result = await reviewAccessRequests(request('{"action":"list"}'), secret, provider);
  assert.equal(result.status, 503); assert.ok(!(await result.text()).includes(secret));
  assert.equal(result.headers.get("access-control-allow-origin"), null);
});

test("provider adapter hard-pins Dev, normalizes safe errors and preserves activation redirect", async () => {
  let calls = 0;
  const transport = async (url, options) => {
    calls++; assert.ok(url.startsWith("https://dbcakdqthnamgjfkkxzn.supabase.co/")); assert.equal(options.redirect, "error");
    if (url.includes("/invite?")) { assert.equal(new URL(url).searchParams.get("redirect_to"), "http://localhost:3000/api/auth/activation/callback"); return new Response(JSON.stringify({ id: userId })); }
    return new Response(secret, { status: 503 });
  };
  await assert.rejects(devReviewProvider("https://other-project.supabase.co", secret, transport).rpc("list")); assert.equal(calls, 0);
  const provider = devReviewProvider("https://dbcakdqthnamgjfkkxzn.supabase.co", secret, transport);
  await assert.rejects(provider.createUser({}), error => !error.message.includes(secret));
  assert.deepEqual(await provider.invite(row.email), { outcome: "sent", userId });
});

test("owner setup preserves unrelated environment and refuses shared capabilities/remote targets", () => {
  const env = 'SUPABASE_URL=https://dbcakdqthnamgjfkkxzn.supabase.co\r\nACCESS_REQUEST_SUBMISSION_SECRET=synthetic-public-submission\r\nADMIN_API_KEY=synthetic-unrelated-key\r\n';
  const updated = adminReviewEnvironment(env, secret);
  assert.ok(updated.startsWith(env)); assert.equal(adminReviewEnvironment(updated, secret), updated);
  assert.throws(() => adminReviewEnvironment(env.replace("dbcakdqthnamgjfkkxzn", "other-project"), secret));
  assert.throws(() => adminReviewEnvironment(env.replace("synthetic-public-submission", secret), secret));
});

let build;
let handler;
let oldEnvironment;
let originalFetch;
let calls = [];
const origin = "http://localhost:3000";
const adminKey = "synthetic-admin-key-only-for-test";
before(async () => {
  oldEnvironment = Object.fromEntries(["AUTH_ORIGIN", "ADMIN_API_KEY", "ADMIN_ACCESS_REQUEST_SECRET", "SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "ACCESS_REQUEST_SUBMISSION_SECRET"].map(key => [key, process.env[key]]));
  Object.assign(process.env, { AUTH_ORIGIN: origin, ADMIN_API_KEY: adminKey, ADMIN_ACCESS_REQUEST_SECRET: secret, SUPABASE_URL: "https://dbcakdqthnamgjfkkxzn.supabase.co", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic", ACCESS_REQUEST_SUBMISSION_SECRET: "different-scoped-capability" });
  build = await sessionTestBuild(["lib/admin/access-requests.ts", "lib/api.ts"]);
  handler = build.require("lib/admin/access-requests.js").reviewAdminAccessRequest;
  originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => { calls.push({ url, options }); return new Response(JSON.stringify({ ok: true, data: row })); };
});
after(async () => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(oldEnvironment ?? {})) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  await build?.stop();
});
const request = (body, headers = {}, suffix = "", method = "PATCH") => new Request(`${origin}/api/admin/accessrequests${suffix}`, {
  method, headers: { "x-admin-key": adminKey, "Content-Type": "application/json", ...headers }, ...(method === "PATCH" ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}),
});

test("admin key checked before validation/provider access; browser cross-origin requests denied", async () => {
  calls = [];
  assert.equal((await handler(request("{", { "x-admin-key": "wrong" }))).status, 401);
  assert.equal(calls.length, 0);
  for (const headers of [{ Origin: "null" }, { Origin: "http://localhost:3001" }, { Origin: "https://localhost:3000" }, { "Sec-Fetch-Site": "cross-site" }, { "Sec-Fetch-Mode": "navigate" }]) assert.equal((await handler(request({ id, action: "approve" }, headers))).status, 403);
  assert.equal(calls.length, 0);
});

test("Next exact UUID/query/body contracts reject injection, malformed/oversized JSON and wrong methods", async () => {
  calls = [];
  for (const body of ["{", { id, action: "delete" }, { id, action: "approve", email: row.email }, { id: "bad", action: "reject" }, { action: "list" }, { id, action: "detail" }]) assert.equal((await handler(request(body))).status, 400);
  assert.equal((await handler(request(" ".repeat(5000)))).status, 413);
  assert.equal((await handler(request({ id, action: "approve" }, { "Content-Type": "text/plain" }))).status, 415);
  for (const suffix of ["?id=bad", `?id=${id}&id=${id}`, "?status=pending", `?id=${id}&status=active`]) assert.equal((await handler(request(undefined, {}, suffix, "GET"))).status, 400);
  assert.equal((await handler(request(undefined, {}, "", "DELETE"))).status, 405);
  assert.equal(calls.length, 0);
});

test("desktop requests require no Origin and forward neither admin keys nor cookies", async () => {
  calls = [];
  const result = await handler(request({ id, action: "approve" }, { Cookie: "synthetic-private-cookie" }));
  assert.equal(result.status, 200); assert.ok(result.headers.get("cache-control").includes("no-store"));
  assert.equal(result.headers.get("set-cookie"), null); assert.equal(calls.length, 1);
  assert.equal(calls[0].options.headers.Authorization, `Bearer ${secret}`);
  assert.ok(!JSON.stringify(calls[0]).includes(adminKey)); assert.equal(calls[0].options.headers.Cookie, undefined);
  assert.deepEqual(JSON.parse(calls[0].options.body), { id, action: "approve" });
});

test("Next uses fixed list/detail forwarding, strips private fields and sanitizes upstream errors", async () => {
  calls = [];
  await handler(request(undefined, {}, "", "GET")); await handler(request(undefined, {}, `?id=${id}`, "GET"));
  assert.deepEqual(calls.map(call => JSON.parse(call.options.body)), [{ action: "list" }, { id, action: "detail" }]);
  const goodFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ ok: false, error: secret, data: { ...row, operation_token: secret } }), { status: 409 });
    const result = await handler(request({ id, action: "approve" })); assert.equal(result.status, 409); assert.ok(!(await result.text()).includes(secret));
    process.env.ADMIN_ACCESS_REQUEST_SECRET = process.env.ACCESS_REQUEST_SUBMISSION_SECRET;
    assert.equal((await handler(request({ id, action: "approve" }))).status, 503);
  } finally { globalThis.fetch = goodFetch; process.env.ADMIN_ACCESS_REQUEST_SECRET = secret; }
});
