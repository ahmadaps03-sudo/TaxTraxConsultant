import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import typescript from "typescript";
import { sitePersistence } from "../../supabase/functions/site-persistence/core.mjs";
import { siteProvider } from "../../supabase/functions/site-persistence/provider.mjs";

const nativeRequire = createRequire(import.meta.url);
async function load(filename, dependencies = {}) {
  const source = await readFile(new URL(`../${filename}`, import.meta.url), "utf8");
  const compiled = typescript.transpileModule(source, { fileName: filename, compilerOptions: {
    module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  const module = { exports: {} };
  const require = name => name === "server-only" ? {} : Object.hasOwn(dependencies, name) ? dependencies[name] : nativeRequire(name);
  new Function("require", "module", "exports", compiled)(require, module, module.exports);
  return module.exports;
}

const file = "00000000-0000-4000-8000-000000000001.mp4";
const url = "https://synthetic.supabase.co";
const secrets = { ingest: "synthetic_ingest_capability_abcdefghijklmnopqrstuvwxyz123456", admin: "synthetic_admin_capability_abcdefghijklmnopqrstuvwxyz123456" };
const edgeRequest = (scope, body) => new Request(`${url}/functions/v1/site-persistence`, {
  method: "POST", headers: { "Content-Type": "application/json", Authorization: scope ? `Bearer ${secrets[scope]}` : "" }, body: JSON.stringify(body),
});

test("Storage migration creates a private, bounded bucket with no direct client object access", async () => {
  const sql = await readFile(new URL("../../supabase/migrations/20261014000100_site_video_storage.sql", import.meta.url), "utf8");
  assert.match(sql, /'site-videos', 'site-videos', false, 52428800/);
  assert.match(sql, /video\/mp4', 'video\/webm', 'video\/quicktime/);
  assert.match(sql, /as restrictive for all to anon, authenticated/);
  assert.match(sql, /bucket_id <> 'site-videos'/);
  assert.match(sql, /site_video_file_unique/);
  assert.match(sql, /site_video_deletion_pending_private/);
  assert.doesNotMatch(sql, /client-documents|grant .* to anon|grant .* to authenticated/i);
});

test("Edge capability restricts upload, playback and cleanup; validates size and MIME", async () => {
  const calls = [];
  const provider = {
    async signVideoUpload(size, contentType) { calls.push(["sign", size, contentType]); return { file, uploadUrl: `${url}/storage/v1/object/upload/sign/site-videos/${file}?token=synthetic` }; },
    async cleanupVideoUpload(name) { calls.push(["cleanup", name]); },
    async signVideoPlayback(name) { calls.push(["playback", name]); return { url: `${url}/storage/v1/object/sign/site-videos/${file}?token=synthetic` }; },
    async cleanupVideoOrphans(dryRun) { calls.push(["orphans", dryRun]); return { eligible: 1, removed: dryRun ? 0 : 1 }; },
  };
  const upload = { action: "video_upload_sign", size: 50 * 1024 * 1024, contentType: "video/mp4" };
  assert.equal((await sitePersistence(edgeRequest("admin", upload), secrets, provider)).status, 200);
  for (const invalid of [{ ...upload, size: 50 * 1024 * 1024 + 1 }, { ...upload, size: 0 }, { ...upload, contentType: "text/html" }, { ...upload, extra: true }]) {
    assert.equal((await sitePersistence(edgeRequest("admin", invalid), secrets, provider)).status, 400);
  }
  assert.equal((await sitePersistence(edgeRequest("ingest", upload), secrets, provider)).status, 400);
  assert.equal((await sitePersistence(edgeRequest(null, upload), secrets, provider)).status, 403);
  assert.equal((await sitePersistence(edgeRequest("ingest", { action: "video_upload_cleanup", file }), secrets, provider)).status, 400);
  assert.equal((await sitePersistence(edgeRequest("admin", { action: "video_upload_cleanup", file }), secrets, provider)).status, 200);
  assert.equal((await sitePersistence(edgeRequest("ingest", { action: "video_playback_sign", file }), secrets, provider)).status, 200);
  assert.equal((await sitePersistence(edgeRequest("ingest", { action: "video_orphan_cleanup", dryRun: false }), secrets, provider)).status, 400);
  assert.equal((await sitePersistence(edgeRequest("admin", { action: "video_orphan_cleanup", dryRun: true }), secrets, provider)).status, 200);
  assert.deepEqual(calls.map(row => row[0]), ["sign", "cleanup", "playback", "orphans"]);
});

test("Admin upload route preserves auth boundary, rejects oversized/invalid input and returns signed permission", async () => {
  const previous = process.env.ADMIN_API_KEY;
  process.env.ADMIN_API_KEY = "synthetic-admin-key-for-tests";
  const calls = [];
  try {
    const client = {
      signSiteVideoUpload: async (size, type) => { calls.push(["sign", size, type]); return { file, uploadUrl: `${url}/storage/v1/object/upload/sign/site-videos/${file}?token=synthetic` }; },
      cleanupSiteVideoUpload: async name => { calls.push(["delete", name]); },
    };
    const route = await load("app/api/admin/upload/route.ts", {
      "@/lib/site-persistence/client": client,
      "@/lib/api": await load("lib/api.ts"),
      "@/lib/portal/body": await load("lib/portal/body.ts"),
    });
    const request = (body, key = process.env.ADMIN_API_KEY) => new Request("http://localhost:3000/api/admin/upload", {
      method: "POST", headers: { "Content-Type": "application/json", ...(key ? { "x-admin-key": key } : {}) }, body: JSON.stringify(body),
    });
    assert.equal((await route.POST(request({ size: 1, contentType: "video/mp4" }, null))).status, 401);
    assert.equal((await route.POST(request({ size: 50 * 1024 * 1024 + 1, contentType: "video/mp4" }))).status, 413);
    assert.equal((await route.POST(request({ size: 1, contentType: "text/html" }))).status, 415);
    assert.equal((await route.POST(request({ size: 1, contentType: "video/mp4", userId: "forged" }))).status, 415);
    const response = await route.POST(request({ size: 1, contentType: "video/mp4" }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.deepEqual((await response.json()).data, { file, uploadUrl: `${url}/storage/v1/object/upload/sign/site-videos/${file}?token=synthetic` });
    assert.equal((await route.DELETE(new Request(`http://localhost:3000/api/admin/upload?file=${file}`, { method: "DELETE", headers: { "x-admin-key": process.env.ADMIN_API_KEY } }))).status, 200);
    assert.deepEqual(calls.map(row => row[0]), ["sign", "delete"]);
  } finally {
    if (previous === undefined) delete process.env.ADMIN_API_KEY; else process.env.ADMIN_API_KEY = previous;
  }
});

test("provider validates actual Storage object before metadata, hides before delete and cleans failed attachment", async () => {
  const events = [];
  let rows = [];
  let objectPresent = true;
  let insertFails = false;
  const timestamp = "2026-10-12T12:00:00.000Z";
  const transport = async (endpoint, options) => {
    const path = new URL(endpoint).pathname;
    events.push([options.method, path]);
    if (path.endsWith("/object/info/site-videos/" + file)) return objectPresent
      ? Response.json({ size: 1024, content_type: "video/mp4", metadata: {} }) : new Response("missing", { status: 404 });
    if (path.endsWith("/object/site-videos") && options.method === "DELETE") { objectPresent = false; return Response.json([]); }
    if (path.endsWith("/rpc/site_update_record")) {
      const patch = JSON.parse(options.body).p_patch;
      rows = rows.map(row => ({ ...row, data: { ...row.data, ...patch } }));
      return Response.json(rows);
    }
    if (path.endsWith("/rpc/site_delete_record")) { const old = rows; rows = []; return Response.json(old); }
    if (path.endsWith("/site_records") && options.method === "GET") return Response.json(rows);
    if (path.endsWith("/site_records") && options.method === "POST") {
      if (insertFails) return new Response("private database error", { status: 503 });
      const body = JSON.parse(options.body); rows.push({ ...body, created_at: timestamp }); return Response.json(rows);
    }
    return new Response("unexpected", { status: 500 });
  };
  const provider = siteProvider(url, "synthetic_service_key", transport);
  const data = { kind: "file", file, published: true, title: "Synthetic video" };
  const added = await provider.add("videos", data);
  assert.equal(added.file, file);
  assert.equal((await provider.add("videos", data)).id, added.id);
  const deleted = await provider.remove("videos", added.id);
  assert.equal(deleted.id, added.id);
  assert.equal(objectPresent, false);
  assert.equal(rows.length, 0);
  assert.ok(events.findIndex(row => row[1].endsWith("/rpc/site_update_record")) < events.findIndex(row => row[1].endsWith("/object/site-videos")));
  objectPresent = true; insertFails = true;
  await assert.rejects(provider.add("videos", data), error => !error.message.includes("private database error"));
  assert.equal(objectPresent, false);
});

test("provider signs only published objects and never exposes draft or missing-object links", async () => {
  let published = false;
  let metadataPresent = true;
  let objectPresent = true;
  const seen = [];
  const transport = async (endpoint, options) => {
    const path = new URL(endpoint).pathname;
    seen.push(path);
    if (path.endsWith("/site_records")) return Response.json(metadataPresent
      ? [{ id: "synthetic", created_at: "2026-10-12T12:00:00Z", data: { kind: "file", file, published } }] : []);
    if (path.endsWith(`/object/info/site-videos/${file}`)) return objectPresent
      ? Response.json({ size: 1234, content_type: "video/mp4", metadata: {} }) : new Response("missing", { status: 404 });
    if (path.includes("/object/upload/sign/site-videos/")) return Response.json({ url: `${path.slice("/storage/v1".length)}?token=synthetic` });
    if (path.endsWith(`/object/sign/site-videos/${file}`)) return Response.json({ signedURL: `/object/sign/site-videos/${file}?token=synthetic` });
    return new Response("unexpected", { status: 500 });
  };
  const provider = siteProvider(url, "synthetic_service_key", transport);
  metadataPresent = false;
  assert.equal(await provider.signVideoPlayback(file), null);
  metadataPresent = true;
  assert.equal(await provider.signVideoPlayback(file), null);
  assert.ok(!seen.some(path => path.includes("/object/sign/")));
  published = true;
  assert.deepEqual(await provider.signVideoPlayback(file), { url: `${url}/storage/v1/object/sign/site-videos/${file}?token=synthetic` });
  await assert.rejects(provider.cleanupVideoUpload(file));
  objectPresent = false;
  await assert.rejects(provider.signVideoPlayback(file));
  const signed = await provider.signVideoUpload(50 * 1024 * 1024, "video/mp4");
  assert.match(signed.file, /^[a-f0-9-]{36}\.mp4$/);
  assert.ok(signed.uploadUrl.startsWith(`${url}/storage/v1/object/upload/sign/site-videos/`));
  await assert.rejects(provider.signVideoUpload(50 * 1024 * 1024 + 1, "video/mp4"));
});

test("orphan audit does not remove fresh uploads or referenced objects", async () => {
  const old = "00000000-0000-4000-8000-000000000002.mp4";
  const fresh = "00000000-0000-4000-8000-000000000003.mp4";
  const removed = [];
  const transport = async (endpoint, options) => {
    const path = new URL(endpoint).pathname;
    if (path.endsWith("/site_records")) return Response.json([{ id: "synthetic", created_at: "2026-10-12T12:00:00Z", data: { kind: "file", file } }]);
    if (path.endsWith("/object/list/site-videos")) return Response.json([
      { name: file, created_at: "2020-01-01T00:00:00Z" },
      { name: old, created_at: "2020-01-01T00:00:00Z" },
      { name: fresh, created_at: new Date().toISOString() },
    ]);
    if (path.endsWith("/object/site-videos")) { removed.push(JSON.parse(options.body).prefixes[0]); return Response.json([]); }
    return new Response("unexpected", { status: 500 });
  };
  const provider = siteProvider(url, "synthetic_service_key", transport);
  assert.deepEqual(await provider.cleanupVideoOrphans(true), { eligible: 1, removed: 0 });
  assert.deepEqual(removed, []);
  assert.deepEqual(await provider.cleanupVideoOrphans(false), { eligible: 1, removed: 1 });
  assert.deepEqual(removed, [old]);
});

test("Electron renderer has no scoped or privileged credentials and only main handles upload permission", async () => {
  const main = await readFile(new URL("../../admin-app/src/main.js", import.meta.url), "utf8");
  const preload = await readFile(new URL("../../admin-app/src/preload.js", import.meta.url), "utf8");
  const renderer = await readFile(new URL("../../admin-app/src/renderer/app.js", import.meta.url), "utf8");
  assert.match(main, /object\/upload\/sign\/site-videos/);
  assert.match(main, /Readable\.toWeb\(fs\.createReadStream\(picked\)\)/);
  assert.match(renderer, /up to 50 MB/);
  for (const source of [preload, renderer]) assert.doesNotMatch(source, /SITE_ADMIN_DATA_SECRET|SITE_INGEST_SECRET|SUPABASE_SERVICE_ROLE_KEY|storage\/v1|uploadUrl/);
});
