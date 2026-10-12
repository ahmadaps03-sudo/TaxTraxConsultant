import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { sitePersistence } from "../../supabase/functions/site-persistence/core.mjs";
import { siteProvider } from "../../supabase/functions/site-persistence/provider.mjs";
import { sessionTestBuild } from "./lib/session-test-build.mjs";

const secrets = { ingest: "synthetic_ingest_capability_abcdefghijklmnopqrstuvwxyz123456", admin: "synthetic_admin_capability_abcdefghijklmnopqrstuvwxyz123456" };
const sample = { name: "Synthetic Client", email: "synthetic@example.invalid", phone: "+44 7700 900123", subject: "Tax question", service: "Consultation", message: "Synthetic question only.", read: false };
const view = { ts: "2026-10-12T12:00:00.000Z", day: "2026-10-12", path: "/about", country: "GB", visitor: "0123456789abcdef", referrer: null, device: "desktop" };
const request = (scope, body, overrides = {}) => new Request("https://example.invalid/site-persistence", {
  method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${secrets[scope]}`, ...overrides }, body: JSON.stringify(body),
});
const calls = [];
const provider = {
  async rateLimit(hash, max, windowSeconds) { calls.push(["limit", hash, max, windowSeconds]); return { ok: true, retryAfter: 0 }; },
  async add(collection, data) { calls.push(["add", collection]); return { ...data, id: "seed-synthetic", createdAt: "2026-10-12T12:00:00.000Z" }; },
  async list(collection) { calls.push(["list", collection]); return [{ id: "seed-synthetic", createdAt: "2026-10-12T12:00:00.000Z" }]; },
  async update(collection, id, patch) { calls.push(["update", collection, id]); return { ...patch, id, createdAt: "2026-10-12T12:00:00.000Z" }; },
  async remove(collection, id) { calls.push(["delete", collection, id]); return { id, createdAt: "2026-10-12T12:00:00.000Z" }; },
  async pageView(input) { calls.push(["view", input.path]); },
};

test("migration constrains collections, preserves IDs/dates, and defaults private data to deny", async () => {
  const sql = await readFile(new URL("../../supabase/migrations/20261013000100_site_persistence_foundation.sql", import.meta.url), "utf8");
  assert.match(sql, /id text primary key/);
  assert.match(sql, /created_at timestamptz not null default now\(\)/);
  assert.match(sql, /collection in \('messages', 'bookings', 'leads', 'posts', 'videos'\)/);
  assert.match(sql, /alter table public\.site_records enable row level security/);
  assert.match(sql, /alter table public\.site_page_views enable row level security/);
  assert.match(sql, /alter table private\.site_rate_limits enable row level security/);
  assert.match(sql, /revoke all on public\.site_records from public, anon, authenticated, service_role/);
  assert.match(sql, /revoke all on public\.site_page_views from public, anon, authenticated, service_role/);
  assert.match(sql, /create policy site_published_content_read[\s\S]+?collection in \('posts', 'videos'\)/);
  assert.doesNotMatch(sql, /(?:insert|update|delete) on public\.site_records to (?:anon|authenticated)/i);
  assert.doesNotMatch(sql, /(?:client_access_requests|client_profiles|client_documents)/i);
  assert.match(sql, /site_page_view_utc_day/);
});

test("forward-only policy requires explicit boolean publication for posts and videos", async () => {
  const sql = await readFile(new URL("../../supabase/migrations/20261013000200_site_explicit_publication.sql", import.meta.url), "utf8");
  assert.match(sql, /alter policy site_published_content_read on public\.site_records/);
  assert.match(sql, /collection in \('posts', 'videos'\)/);
  assert.match(sql, /data -> 'published' = 'true'::jsonb/);
  assert.doesNotMatch(sql, /create policy|is distinct from 'false'/i);
});

test("limiter migration uses atomic conflict update, checked inputs, expiry and service-only execution", async () => {
  const sql = await readFile(new URL("../../supabase/migrations/20261013000100_site_persistence_foundation.sql", import.meta.url), "utf8");
  assert.match(sql, /on conflict \(key_hash, window_seconds\) do update/);
  assert.match(sql, /returning window_start, hits into bucket_start, bucket_hits/);
  assert.match(sql, /p_hash !~ '\^\[0-9a-f\]\{64\}\$'/);
  assert.match(sql, /p_max not between 1 and 10000/);
  assert.match(sql, /p_window_seconds not between 1 and 86400/);
  assert.match(sql, /grant execute on function public\.site_take_rate_limit\(text, integer, integer\) to service_role/);
  assert.match(sql, /delete from public\.site_page_views where ts < clock_timestamp\(\) - interval '90 days'/);
  assert.match(sql, /delete from private\.site_rate_limits where window_start/);
});

test("separate scoped capabilities enforce public/private operations and stable response shape", async () => {
  calls.length = 0;
  const added = await sitePersistence(request("ingest", { action: "record_add", collection: "messages", data: sample }), secrets, provider);
  assert.equal(added.status, 200);
  assert.deepEqual((await added.json()).data, { ...sample, id: "seed-synthetic", createdAt: "2026-10-12T12:00:00.000Z" });
  assert.equal(added.headers.get("cache-control"), "private, no-store");
  assert.equal((await sitePersistence(request("ingest", { action: "record_list", collection: "messages" }), secrets, provider)).status, 400);
  assert.equal((await sitePersistence(request("ingest", { action: "record_add", collection: "posts", data: sample }), secrets, provider)).status, 400);
  assert.equal((await sitePersistence(request("admin", { action: "record_list", collection: "messages" }), secrets, provider)).status, 200);
  assert.equal(calls.filter(item => item[0] === "add").length, 1);
  assert.equal(calls.filter(item => item[0] === "list").length, 1);
});

test("admin CRUD uses exact requests and retains IDs and timestamps", async () => {
  calls.length = 0;
  const added = await sitePersistence(request("admin", { action: "record_add", collection: "posts", data: { title: "Synthetic", published: false } }), secrets, provider);
  assert.deepEqual(await added.json(), { ok: true, data: { title: "Synthetic", published: false, id: "seed-synthetic", createdAt: "2026-10-12T12:00:00.000Z" } });
  const listed = await sitePersistence(request("admin", { action: "record_list", collection: "posts" }), secrets, provider);
  assert.equal((await listed.json()).data[0].id, "seed-synthetic");
  const updated = await sitePersistence(request("admin", { action: "record_update", collection: "posts", id: "seed-synthetic", patch: { published: true } }), secrets, provider);
  assert.deepEqual((await updated.json()).data, { published: true, id: "seed-synthetic", createdAt: "2026-10-12T12:00:00.000Z" });
  const deleted = await sitePersistence(request("admin", { action: "record_delete", collection: "posts", id: "seed-synthetic" }), secrets, provider);
  assert.deepEqual((await deleted.json()).data, { id: "seed-synthetic", createdAt: "2026-10-12T12:00:00.000Z" });
  assert.deepEqual(calls.map(item => item[0]), ["add", "list", "update", "delete"]);
});

test("admin mutations reject absent or wrong capabilities, forged fields and collections", async () => {
  calls.length = 0;
  const update = { action: "record_update", collection: "messages", id: "seed-synthetic", patch: { read: true } };
  const remove = { action: "record_delete", collection: "messages", id: "seed-synthetic" };
  for (const body of [update, remove]) {
    assert.equal((await sitePersistence(request("ingest", body), secrets, provider)).status, 400);
    assert.equal((await sitePersistence(request("admin", body, { Authorization: "" }), secrets, provider)).status, 403);
    assert.equal((await sitePersistence(request("admin", body, { Authorization: "Bearer wrong" }), secrets, provider)).status, 403);
  }
  for (const body of [
    { ...update, collection: "client_profiles" }, { ...remove, collection: "client_profiles" },
    { ...update, patch: { id: "forged" } }, { ...update, patch: { createdAt: "forged" } },
    { ...update, patch: {} }, { ...update, id: "bad\nid" }, { ...remove, id: "" },
    { ...remove, extra: "forged" },
  ]) assert.equal((await sitePersistence(request("admin", body), secrets, provider)).status, 400);
  assert.deepEqual(calls, []);
});

test("missing configured admin capability fails closed before any provider operation", async () => {
  calls.length = 0;
  const missing = { ...secrets, admin: undefined };
  const response = await sitePersistence(request("admin", { action: "record_update", collection: "posts", id: "seed-synthetic", patch: { published: true } }), missing, provider);
  assert.equal(response.status, 503);
  assert.deepEqual(calls, []);
});

test("malformed credentials, input, extra fields and oversized bodies cannot write", async () => {
  calls.length = 0;
  for (const headers of [{ Authorization: "Bearer wrong" }, { "Content-Type": "text/plain" }]) {
    const result = await sitePersistence(request("ingest", { action: "record_add", collection: "messages", data: sample }, headers), secrets, provider);
    assert.ok([403, 400].includes(result.status));
  }
  for (const data of [{ ...sample, status: "active" }, { ...sample, email: "not-email" }, { ...sample, message: "bad\nbody" }]) {
    assert.equal((await sitePersistence(request("ingest", { action: "record_add", collection: "messages", data }), secrets, provider)).status, 400);
  }
  assert.equal((await sitePersistence(request("ingest", { action: "record_add", collection: "messages", data: sample, userId: "forged" }), secrets, provider)).status, 400);
  assert.equal((await sitePersistence(request("ingest", { action: "record_add", collection: "messages", data: sample }, { "Content-Length": "1048577" }), secrets, provider)).status, 400);
  assert.equal(calls.length, 0);
});

test("page-view validation and limiter inputs fail closed before provider calls", async () => {
  calls.length = 0;
  assert.equal((await sitePersistence(request("ingest", { action: "page_view", view }), secrets, provider)).status, 200);
  for (const invalid of [{ ...view, day: "2026-10-11" }, { ...view, visitor: "raw-IP" }, { ...view, path: "https://elsewhere.invalid" }]) {
    assert.equal((await sitePersistence(request("ingest", { action: "page_view", view: invalid }), secrets, provider)).status, 400);
  }
  const validLimit = { action: "rate_limit", hash: "a".repeat(64), max: 5, windowSeconds: 600 };
  assert.equal((await sitePersistence(request("ingest", validLimit), secrets, provider)).status, 200);
  for (const bad of [{ ...validLimit, hash: "raw-ip" }, { ...validLimit, max: 0 }, { ...validLimit, windowSeconds: -1 }]) {
    assert.equal((await sitePersistence(request("ingest", bad), secrets, provider)).status, 400);
  }
  assert.deepEqual(calls.map(item => item[0]), ["view", "limit"]);
});

test("provider sends privileged credentials only inside the Edge layer and never returns raw errors", async () => {
  const privateKey = "synthetic_service_credential_do_not_expose";
  const seen = [];
  const transport = async (url, options) => {
    seen.push({ url, options });
    if (url.endsWith("rpc/site_take_rate_limit")) return new Response('[{"ok":true,"retry_after":0}]', { status: 200 });
    if (url.includes("site_records?")) return new Response('[{"id":"seed-synthetic","created_at":"2026-10-12T12:00:00Z","data":{"published":true}}]', { status: 200 });
    return new Response("internal private detail", { status: 503 });
  };
  const client = siteProvider("https://synthetic.supabase.co", privateKey, transport);
  assert.deepEqual(await client.rateLimit("a".repeat(64), 5, 600), { ok: true, retryAfter: 0 });
  assert.deepEqual(await client.list("posts"), [{ id: "seed-synthetic", createdAt: "2026-10-12T12:00:00.000Z", published: true }]);
  await assert.rejects(client.pageView(view), error => !error.message.includes(privateKey) && !error.message.includes("internal private detail"));
  assert.ok(seen.every(entry => entry.options.headers.Authorization === `Bearer ${privateKey}`));
  const runtime = await readFile(new URL("../lib/site-persistence/client.ts", import.meta.url), "utf8");
  assert.match(runtime, /import "server-only"/);
  assert.doesNotMatch(runtime, /service.role|SUPABASE_SERVICE_ROLE_KEY/i);
  assert.doesNotMatch(runtime, /dbcakdqthnamgjfkkxzn/);
});

test("provider performs collection-bound atomic mutations without exposing raw errors", async () => {
  const privateKey = "synthetic_service_credential_do_not_expose";
  const seen = [];
  const transport = async (url, options) => {
    seen.push({ url, options });
    if (url.endsWith("rpc/site_update_record")) return new Response('[{"id":"synthetic-id","created_at":"2026-10-12T12:00:00Z","data":{"published":false,"title":"Revised"}}]', { status: 200 });
    if (url.endsWith("rpc/site_delete_record")) return new Response('[]', { status: 200 });
    return new Response("sensitive provider failure", { status: 503 });
  };
  const client = siteProvider("https://synthetic.supabase.co", privateKey, transport);
  assert.deepEqual(await client.update("posts", "synthetic-id", { title: "Revised" }), { published: false, title: "Revised", id: "synthetic-id", createdAt: "2026-10-12T12:00:00.000Z" });
  assert.equal(await client.remove("posts", "missing-id"), null);
  assert.deepEqual(JSON.parse(seen[0].options.body), { p_collection: "posts", p_id: "synthetic-id", p_patch: { title: "Revised" } });
  assert.deepEqual(JSON.parse(seen[1].options.body), { p_collection: "posts", p_id: "missing-id" });
  assert.ok(seen.every(entry => entry.options.headers.Authorization === `Bearer ${privateKey}`));
  await assert.rejects(client.add("posts", { title: "Synthetic" }), error => !error.message.includes(privateKey) && !error.message.includes("sensitive provider failure"));
});

test("website helper hashes limiter identity and uses only scoped server capabilities", async () => {
  const environmentNames = ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SITE_INGEST_SECRET", "SITE_ADMIN_DATA_SECRET"];
  const previous = Object.fromEntries(environmentNames.map(name => [name, process.env[name]]));
  Object.assign(process.env, {
    SUPABASE_URL: "https://synthetic.supabase.co", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic",
    SITE_INGEST_SECRET: secrets.ingest, SITE_ADMIN_DATA_SECRET: secrets.admin,
  });
  const build = await sessionTestBuild(["lib/site-persistence/client.ts"]);
  const oldFetch = globalThis.fetch;
  const seen = [];
  try {
    const helper = build.require("lib/site-persistence/client.js");
    globalThis.fetch = async (url, options) => {
      seen.push({ url, options, body: JSON.parse(options.body) });
      const data = JSON.parse(options.body).action === "rate_limit" ? { ok: true, retryAfter: 0 } : { id: "synthetic-id", createdAt: "2026-10-12T12:00:00.000Z" };
      return new Response(JSON.stringify({ ok: true, data }), { status: 200 });
    };
    assert.deepEqual(await helper.takeSiteRateLimit("contact:192.0.2.1", 5, 600), { ok: true, retryAfter: 0 });
    assert.equal(seen[0].url, "https://synthetic.supabase.co/functions/v1/site-persistence");
    assert.equal(seen[0].options.headers.apikey, "sb_publishable_synthetic");
    assert.equal(seen[0].options.headers.Authorization, `Bearer ${secrets.ingest}`);
    assert.equal(seen[0].options.cache, "no-store");
    assert.match(seen[0].body.hash, /^[0-9a-f]{64}$/);
    assert.ok(!JSON.stringify(seen[0].body).includes("192.0.2.1"));
    assert.equal((await helper.updateSiteRecordForAdmin("posts", "synthetic-id", { published: false })).id, "synthetic-id");
    assert.equal((await helper.deleteSiteRecordForAdmin("posts", "synthetic-id")).id, "synthetic-id");
    assert.equal(seen[1].body.action, "record_update");
    assert.equal(seen[2].body.action, "record_delete");
    assert.ok(seen.slice(1).every(entry => entry.options.headers.Authorization === `Bearer ${secrets.admin}`));
    await assert.rejects(helper.takeSiteRateLimit("bad", 0, 600), { name: "Error", message: "Site persistence is temporarily unavailable." });
    delete process.env.SITE_INGEST_SECRET;
    await assert.rejects(helper.takeSiteRateLimit("contact:192.0.2.1", 5, 600), { name: "Error", message: "Site persistence is temporarily unavailable." });
    delete process.env.SITE_ADMIN_DATA_SECRET;
    await assert.rejects(helper.updateSiteRecordForAdmin("posts", "synthetic-id", { published: true }), { name: "Error", message: "Site persistence is temporarily unavailable." });
    assert.equal(seen.length, 3);
  } finally {
    globalThis.fetch = oldFetch;
    for (const [name, value] of Object.entries(previous)) if (value === undefined) delete process.env[name]; else process.env[name] = value;
    await build.stop();
  }
});

test("analytics, client count and pruning require admin capability and expose aggregates only", async () => {
  const aggregate = { views: 3, visitors: 2, byDay: [], countries: [], pages: [], referrers: [], devices: [] };
  const seen = [];
  const adapter = {
    async analytics(days) { seen.push(["analytics", days]); return aggregate; },
    async activeClientCount() { seen.push(["clients"]); return 2; },
    async pruneTelemetry() { seen.push(["prune"]); },
  };
  for (const input of [{ action: "analytics_summary", days: 30 }, { action: "active_client_count" }, { action: "telemetry_prune" }]) {
    assert.equal((await sitePersistence(request("ingest", input), secrets, adapter)).status, 400);
    assert.equal((await sitePersistence(request("admin", input, { Authorization: "" }), secrets, adapter)).status, 403);
  }
  const result = await sitePersistence(request("admin", { action: "analytics_summary", days: 30 }), secrets, adapter);
  assert.deepEqual((await result.json()).data, aggregate);
  assert.equal((await sitePersistence(request("admin", { action: "analytics_summary", days: 91 }), secrets, adapter)).status, 400);
  assert.equal((await sitePersistence(request("admin", { action: "active_client_count" }), secrets, adapter)).status, 200);
  assert.equal((await sitePersistence(request("admin", { action: "telemetry_prune" }), secrets, adapter)).status, 200);
  assert.deepEqual(seen, [["analytics", 30], ["clients"], ["prune"]]);
  assert.doesNotMatch(JSON.stringify(aggregate), /visitor_hash|raw_ip|user_id/);
});

test("provider reads only active profile count and bounded SQL aggregates", async () => {
  const aggregate = { views: 3, visitors: 2, byDay: [], countries: [], pages: [], referrers: [], devices: [] };
  const seen = [];
  const transport = async (url, options) => {
    seen.push([url, options]);
    if (url.includes("rpc/site_analytics_aggregate")) return Response.json(aggregate);
    if (url.includes("client_profiles?")) return new Response(null, { status: 200, headers: { "Content-Range": "0-0/2" } });
    if (url.includes("rpc/site_prune_telemetry")) return Response.json(null);
    return new Response("private error", { status: 503 });
  };
  const provider = siteProvider("https://synthetic.supabase.co", "synthetic_service_key", transport);
  assert.deepEqual(await provider.analytics(30), aggregate);
  assert.equal(await provider.activeClientCount(), 2);
  await provider.pruneTelemetry();
  assert.match(seen[0][0], /rpc\/site_analytics_aggregate/);
  assert.deepEqual(JSON.parse(seen[0][1].body), { p_days: 30 });
  assert.match(seen[1][0], /client_profiles\?status=eq\.active/);
  assert.equal(seen[1][1].method, "HEAD");
  assert.equal(seen[1][1].headers.Prefer, "count=exact");
  assert.ok(seen.every(([, options]) => options.headers.Authorization === "Bearer synthetic_service_key"));
});
