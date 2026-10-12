import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import test from "node:test";
import typescript from "typescript";

const nativeRequire = createRequire(import.meta.url);
const createdAt = "2026-10-12T12:00:00.000Z";

async function load(filename, dependencies = {}, additional = "") {
  const source = await readFile(new URL(`../${filename}`, import.meta.url), "utf8");
  const compiled = typescript.transpileModule(source, { fileName: filename, compilerOptions: {
    module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  const module = { exports: {} };
  const require = name => name === "server-only" ? {} : Object.hasOwn(dependencies, name) ? dependencies[name] : nativeRequire(name);
  new Function("require", "module", "exports", `${compiled}\n${additional}`)(require, module, module.exports);
  return module.exports;
}

const request = (path, method = "GET", body, headers = {}) => new Request(`http://localhost:3000${path}`, {
  method, headers: { Host: "localhost:3000", Origin: "http://localhost:3000", ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...headers },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

test("public submissions use ingest, keep response shapes and fail closed on outage", async () => {
  const received = [];
  let unavailable = false;
  let limiterUnavailable = false;
  let limiterBlocked = false;
  const site = { takeSiteRateLimit: async () => { if (limiterUnavailable) throw new Error("private limiter detail"); return limiterBlocked ? { ok: false, retryAfter: 42 } : { ok: true, retryAfter: 0 }; }, addSiteSubmission: async (collection, data) => {
    if (unavailable) throw new Error("synthetic provider detail");
    received.push({ collection, data });
    return { ...data, id: randomUUID(), createdAt };
  } };
  const validation = await load("lib/validation.ts");
  const api = await load("lib/api.ts");
  const http = await load("lib/http.ts", { "./network/client-ip": { clientIp: () => "unknown" } });
  const contact = await load("app/api/contact/route.ts", { "@/lib/site-persistence/client": site, "@/lib/validation": validation, "@/lib/http": http });
  const bookings = await load("app/api/bookings/route.ts", { "@/lib/site-persistence/client": site, "@/lib/validation": validation, "@/lib/http": http });
  const leads = await load("app/api/leads/route.ts", { "@/lib/site-persistence/client": site, "@/lib/api": api, "@/lib/http": http });
  const contactInput = { name: "Synthetic Visitor", email: "visitor@example.invalid", phone: "+44 7700 900123", subject: "Synthetic question", service: "Consultation", message: "Synthetic message for testing only." };
  const bookingInput = { name: "Synthetic Visitor", email: "visitor@example.invalid", phone: "+44 7700 900123", date: "2099-01-01", time: "10:00", service: "Consultation", revenue: "", timeline: "" };
  assert.equal((await contact.POST(request("/api/contact", "POST", contactInput))).status, 200);
  assert.equal((await bookings.POST(request("/api/bookings", "POST", bookingInput))).status, 200);
  const leadResponse = await leads.POST(request("/api/leads", "POST", { name: "Synthetic Visitor", email: "visitor@example.invalid", whatsapp: "", reportTitle: "Synthetic report" }));
  assert.deepEqual(await leadResponse.json(), { ok: true });
  assert.deepEqual(received.map(row => row.collection), ["messages", "bookings", "leads"]);
  assert.equal(received[0].data.read, false);
  assert.equal(received[1].data.status, "pending");
  assert.equal((await contact.POST(request("/api/contact", "POST", { ...contactInput, website: "bot" }))).status, 200);
  assert.equal(received.length, 3);
  unavailable = true;
  const failed = await contact.POST(request("/api/contact", "POST", contactInput));
  assert.equal(failed.status, 503);
  assert.ok(!(await failed.text()).includes("synthetic provider detail"));
  assert.equal((await bookings.POST(request("/api/bookings", "POST", bookingInput))).status, 503);
  assert.equal((await leads.POST(request("/api/leads", "POST", { name: "Synthetic Visitor", email: "outage@example.invalid" }))).status, 503);
  unavailable = false;
  limiterUnavailable = true;
  const before = received.length;
  for (const [handler, path, input] of [[contact, "/api/contact", contactInput], [bookings, "/api/bookings", bookingInput],
    [leads, "/api/leads", { name: "Synthetic Visitor", email: "visitor@example.invalid" }]]) {
    const result = await handler.POST(request(path, "POST", input));
    assert.equal(result.status, 503);
    assert.ok(!(await result.text()).includes("private limiter detail"));
  }
  assert.equal(received.length, before);
  limiterUnavailable = false;
  limiterBlocked = true;
  for (const [handler, path, input] of [[contact, "/api/contact", contactInput], [bookings, "/api/bookings", bookingInput],
    [leads, "/api/leads", { name: "Synthetic Visitor", email: "visitor@example.invalid" }]]) {
    const result = await handler.POST(request(path, "POST", input));
    assert.equal(result.status, 429);
    if (path !== "/api/leads") assert.equal(result.headers.get("retry-after"), "42");
  }
  assert.equal(received.length, before);
});

test("Admin routes retain Electron CRUD paths, authorization and row shape", async () => {
  const previousKey = process.env.ADMIN_API_KEY;
  process.env.ADMIN_API_KEY = "synthetic-admin-key-for-tests";
  try {
    const rows = { messages: [], bookings: [], leads: [], posts: [], videos: [] };
    let unavailable = false;
    const store = {
      UPLOAD_DIR: "/tmp/taxtrax-synthetic-unused",
      list: async collection => { if (unavailable) throw new Error("private provider detail"); return rows[collection]; },
      add: async (collection, data) => { const row = { ...data, id: randomUUID(), createdAt }; rows[collection].push(row); return row; },
      update: async (collection, id, patch) => { const row = rows[collection].find(item => item.id === id); return row ? Object.assign(row, patch) : null; },
      remove: async (collection, id) => { const index = rows[collection].findIndex(item => item.id === id); return index < 0 ? null : rows[collection].splice(index, 1)[0]; },
      summary: async () => ({ unreadMessages: 0, pendingBookings: 0, leads: 0, totalMessages: 0, totalBookings: 0, posts: 0, videos: 0, clients: 0 }),
    };
    const content = await load("lib/content.ts", { "./store": store, "./site-persistence/client": { listPublishedSiteContent: async collection => rows[collection] } });
    const api = await load("lib/api.ts");
    const body = await load("lib/portal/body.ts");
    const admin = await load("app/api/admin/[collection]/route.ts", {
      "@/lib/store": store, "@/lib/analytics": { getAnalytics: async () => ({ days: 30 }) }, "@/lib/content": content,
      "@/lib/api": api, "@/lib/portal/body": body,
    });
    const ctx = collection => ({ params: { collection } });
    const authorized = { "x-admin-key": process.env.ADMIN_API_KEY };
    assert.equal((await admin.GET(request("/api/admin/posts"), ctx("posts"))).status, 401);
    assert.equal((await admin.GET(request("/api/admin/summary", "GET", undefined, authorized), ctx("summary"))).status, 200);
    assert.equal((await admin.GET(request("/api/admin/analytics", "GET", undefined, authorized), ctx("analytics"))).status, 200);
    const created = await admin.POST(request("/api/admin/posts", "POST", { title: "Synthetic post", content: ["Synthetic paragraph."], published: false }, authorized), ctx("posts"));
    assert.equal(created.status, 200);
    const row = (await created.json()).data;
    assert.equal(row.published, false);
    assert.equal(typeof row.id, "string");
    assert.equal(row.createdAt, createdAt);
    const listed = await admin.GET(request("/api/admin/posts", "GET", undefined, authorized), ctx("posts"));
    assert.equal(listed.headers.get("cache-control"), "private, no-store");
    assert.deepEqual((await listed.json()).data.map(item => item.id), [row.id]);
    const changed = await admin.PATCH(request("/api/admin/posts", "PATCH", { id: row.id, published: true }, authorized), ctx("posts"));
    assert.equal(changed.status, 200);
    assert.deepEqual([(await changed.json()).data.id, rows.posts[0].createdAt], [row.id, createdAt]);
    assert.equal((await admin.DELETE(request(`/api/admin/posts?id=${row.id}`, "DELETE", undefined, authorized), ctx("posts"))).status, 200);
    assert.deepEqual((await (await admin.GET(request("/api/admin/posts", "GET", undefined, authorized), ctx("posts"))).json()).data, []);
    unavailable = true;
    const failed = await admin.GET(request("/api/admin/posts", "GET", undefined, authorized), ctx("posts"));
    assert.equal(failed.status, 503);
    assert.ok(!(await failed.text()).includes("private provider detail"));
  } finally {
    if (previousKey === undefined) delete process.env.ADMIN_API_KEY;
    else process.env.ADMIN_API_KEY = previousKey;
  }
});

test("public content excludes drafts and missing publication", async () => {
  const rows = {
    posts: [
      { id: "public", createdAt, date: "2026-10-12", slug: "public", published: true },
      { id: "draft", createdAt, date: "2026-10-12", slug: "draft", published: false },
      { id: "missing", createdAt, date: "2026-10-12", slug: "missing" },
    ],
    videos: [{ id: "public", createdAt, published: true }, { id: "draft", createdAt, published: false }, { id: "missing", createdAt }],
  };
  const content = await load("lib/content.ts", { "./store": { list: async collection => rows[collection] }, "./site-persistence/client": { listPublishedSiteContent: async collection => rows[collection] } });
  assert.deepEqual((await content.getPublishedPosts()).map(row => row.id), ["public"]);
  assert.deepEqual((await content.getPublishedVideos()).map(row => row.id), ["public"]);
  assert.equal(await content.getPost("draft"), null);
  assert.equal(await content.getPost("missing"), null);
  const feed = await load("app/blog/feed.xml/route.ts", {
    "@/lib/content": { getPublishedPosts: async () => [{ id: "public", title: "Synthetic public", slug: "public", date: "2026-10-12", category: "Test", excerpt: "Synthetic only" }] },
    "@/lib/seo": { SITE_URL: "https://example.invalid" },
  });
  const response = await feed.GET();
  assert.equal(response.headers.get("cache-control"), "no-store");
  const xml = await response.text();
  assert.match(xml, /\/blog\/public/);
  assert.doesNotMatch(xml, /\/blog\/(?:draft|missing)/);
});

test("media redirects only published video metadata to a scoped signed Storage URL", async () => {
  const filename = "00000000-0000-4000-8000-000000000000.mp4";
  let videos = [];
  let unavailable = false;
  const url = "https://synthetic.supabase.co";
  const media = await load("app/api/media/[file]/route.ts", {
    "@/lib/supabase/config": { getSupabaseConfiguration: () => ({ url }) },
    "@/lib/site-persistence/client": {
      listPublishedSiteContent: async () => { if (unavailable) throw new Error("private provider detail"); return videos; },
      signSiteVideoPlayback: async () => ({ url: `${url}/storage/v1/object/sign/site-videos/${filename}?token=synthetic` }),
    },
  });
  const get = () => media.GET(request(`/api/media/${filename}`), { params: { file: filename } });
  for (const published of [false, undefined]) {
    videos = [{ kind: "file", file: filename, published }];
    assert.equal((await get()).status, 404);
  }
  videos = [{ kind: "file", file: filename, published: true }];
  const visible = await get();
  assert.equal(visible.status, 307);
  assert.equal(visible.headers.get("cache-control"), "no-store");
  assert.equal(visible.headers.get("location"), `${url}/storage/v1/object/sign/site-videos/${filename}?token=synthetic`);
  unavailable = true;
  const failed = await get();
  assert.equal(failed.status, 503);
  assert.equal(failed.headers.get("cache-control"), "no-store");
  assert.ok(!(await failed.text()).includes("private provider detail"));
});

test("media redirect preserves browser Range requests to signed playback target", async () => {
  const filename = "00000000-0000-4000-8000-000000000000.mp4";
  let rangeSeen = null;
  const storage = createServer((req, res) => {
    rangeSeen = req.headers.range;
    res.writeHead(206, { "Content-Range": "bytes 0-3/8", "Content-Type": "video/mp4" });
    res.end("test");
  });
  await new Promise(resolve => storage.listen(0, "127.0.0.1", resolve));
  try {
    const url = `http://127.0.0.1:${storage.address().port}`;
    const media = await load("app/api/media/[file]/route.ts", {
      "@/lib/supabase/config": { getSupabaseConfiguration: () => ({ url }) },
      "@/lib/site-persistence/client": {
        listPublishedSiteContent: async () => [{ kind: "file", file: filename, published: true }],
        signSiteVideoPlayback: async () => ({ url: `${url}/storage/v1/object/sign/site-videos/${filename}?token=synthetic` }),
      },
    });
    const redirect = await media.GET(request(`/api/media/${filename}`, "GET", undefined, { Range: "bytes=0-3" }), { params: { file: filename } });
    assert.equal(redirect.status, 307);
    const playback = await fetch(redirect.headers.get("location"), { headers: { Range: "bytes=0-3" } });
    assert.equal(playback.status, 206);
    assert.equal(rangeSeen, "bytes=0-3");
    assert.equal(await playback.text(), "test");
  } finally {
    await new Promise(resolve => storage.close(resolve));
  }
});

test("portal appointments match only the server-validated client email", async () => {
  const service = await load("lib/portal/service.ts", {
    "../supabase/config": { getSupabaseConfiguration: () => ({}) },
    "../site-persistence/client": { SitePersistenceUnavailable: class extends Error {}, listSiteRecordsForAdmin: async () => [
      { id: "mine", email: "client-a@example.invalid", status: "pending", date: "2099-01-01", time: "10:00", service: "Consultation" },
      { id: "other", email: "client-b@example.invalid", status: "pending", date: "2099-01-01", time: "10:00", service: "Consultation" },
      { id: "past", email: "client-a@example.invalid", status: "done", date: "2099-01-01", time: "10:00" },
    ] },
  }, "module.exports.__appointmentsFor = appointmentsFor;");
  assert.deepEqual((await service.__appointmentsFor("client-a@example.invalid")).map(item => item.id), ["mine"]);
  assert.deepEqual((await service.__appointmentsFor("client-b@example.invalid")).map(item => item.id), ["other"]);
  const guard = await readFile(new URL("../lib/portal/guard.ts", import.meta.url), "utf8");
  const source = await readFile(new URL("../lib/portal/service.ts", import.meta.url), "utf8");
  assert.match(guard, /authorizePortalClient\(/);
  assert.match(source, /appointmentsFor\(c\.email\)/);
  assert.doesNotMatch(source, /SELECT id, data FROM records WHERE collection='bookings'/);
});

test("all site collection routes use scoped helpers without a service-role or SQLite fallback", async () => {
  const paths = ["app/api/contact/route.ts", "app/api/bookings/route.ts", "app/api/leads/route.ts", "app/api/admin/[collection]/route.ts", "lib/store.ts", "lib/content.ts", "lib/portal/service.ts"];
  for (const path of paths) {
    const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY|sb_secret_|from ["']@\/lib\/store["'].*add/);
  }
  const store = await readFile(new URL("../lib/store.ts", import.meta.url), "utf8");
  assert.doesNotMatch(store, /INSERT INTO records|UPDATE records|DELETE FROM records/);
});
