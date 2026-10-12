import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import typescript from "typescript";

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

test("page-view writes use a keyed daily hash, trusted proxy only, and no raw IP persistence", async () => {
  const previous = { salt: process.env.ANALYTICS_SALT, proxy: process.env.TRUST_PROXY };
  process.env.ANALYTICS_SALT = "synthetic_analytics_key_abcdefghijklmnopqrstuvwxyz123456";
  process.env.TRUST_PROXY = "0";
  const written = [];
  try {
    const network = await load("lib/network/client-ip.ts");
    const analytics = await load("lib/analytics.ts", {
      "./network/client-ip": network,
      "./store": { list: async () => [] },
      "./site-persistence/client": { writeSitePageView: async view => written.push(view) },
    });
    const request = (ip, ua = "Synthetic Browser") => new Request("https://example.invalid/api/track", { headers: {
      host: "example.invalid", "user-agent": ua, "x-forwarded-for": ip, "x-real-ip": ip, "cf-ipcountry": "GB",
    } });
    assert.equal(await analytics.recordView(request("192.0.2.1"), { path: "/about?token=private", ref: "https://other.invalid/path?secret=1" }), true);
    assert.equal(await analytics.recordView(request("198.51.100.2"), { path: "/about" }), true);
    assert.equal(written[0].visitor, written[1].visitor);
    assert.deepEqual([written[0].path, written[0].referrer, written[0].country], ["/about", "other.invalid", "ZZ"]);
    assert.match(written[0].visitor, /^[0-9a-f]{16}$/);
    assert.doesNotMatch(JSON.stringify(written), /192\.0\.2\.1|198\.51\.100\.2|private|secret=1/);
    process.env.TRUST_PROXY = "1";
    assert.equal(await analytics.recordView(request("192.0.2.1"), { path: "/about" }), true);
    assert.notEqual(written[2].visitor, written[0].visitor);
    assert.equal(written[2].country, "GB");
    assert.equal(await analytics.recordView(request("192.0.2.1", "crawler bot"), { path: "/about" }), false);
    assert.equal(written.length, 3);
  } finally {
    if (previous.salt === undefined) delete process.env.ANALYTICS_SALT; else process.env.ANALYTICS_SALT = previous.salt;
    if (previous.proxy === undefined) delete process.env.TRUST_PROXY; else process.env.TRUST_PROXY = previous.proxy;
  }
});

test("admin analytics preserves existing chart and conversion response shape", async () => {
  const today = new Date().toISOString().slice(0, 10);
  const aggregate = { views: 4, visitors: 2, byDay: [{ day: today, views: 4, visitors: 2 }],
    countries: [{ country: "GB", views: 4, visitors: 2 }], pages: [{ path: "/about", views: 4 }],
    referrers: [], devices: [{ device: "desktop", visitors: 2 }] };
  const records = { bookings: [{ createdAt: `${today}T12:00:00Z`, service: "Consultation" }], messages: [], leads: [] };
  const analytics = await load("lib/analytics.ts", {
    "./network/client-ip": { clientIp: () => "unknown" },
    "./store": { list: async collection => records[collection] },
    "./site-persistence/client": { readSiteAnalytics: async days => { assert.equal(days, 30); return aggregate; } },
  });
  const result = await analytics.getAnalytics(30);
  assert.equal(result.days, 30);
  assert.deepEqual(result.totals, { views: 4, visitors: 2, bookings: 1, messages: 0, leads: 0, conversion: 0.5 });
  assert.equal(result.byDay.length, 30);
  assert.deepEqual(result.byDay.at(-1), { day: today, views: 4, visitors: 2, bookings: 1, messages: 0, leads: 0 });
  assert.deepEqual(result.countries, aggregate.countries);
  assert.deepEqual(result.bookingsByService, [{ service: "Consultation", bookings: 1 }]);
});

test("Admin summary counts only active canonical client profiles", async () => {
  const collections = { messages: [{ read: false }], bookings: [{ status: "pending" }], leads: [], posts: [], videos: [] };
  const calls = [];
  const store = await load("lib/store.ts", { "./site-persistence/client": {
    listSiteRecordsForAdmin: async collection => collections[collection],
    countActiveSiteClients: async () => { calls.push("active profiles"); return 3; },
  } });
  const result = await store.summary();
  assert.equal(result.clients, 3);
  assert.deepEqual(calls, ["active profiles"]);
  assert.deepEqual(Object.keys(result).sort(), ["clients", "leads", "pendingBookings", "posts", "totalBookings", "totalMessages", "unreadMessages", "videos"].sort());
});

test("tracking suppresses writes on limiter outage but keeps the 204 beacon contract", async () => {
  let writes = 0;
  let limiter = { ok: true, retryAfter: 0 };
  const track = await load("app/api/track/route.ts", {
    "@/lib/analytics": { recordView: async () => { writes++; } },
    "@/lib/http": { sameOrigin: () => true, clientIp: () => "unknown", readJson: async () => ({ path: "/about" }) },
    "@/lib/site-persistence/client": { takeSiteRateLimit: async () => { if (!limiter) throw Error("private provider details"); return limiter; } },
  });
  const request = new Request("https://example.invalid/api/track", { method: "POST" });
  assert.equal((await track.POST(request)).status, 204);
  assert.equal(writes, 1);
  limiter = { ok: false, retryAfter: 60 };
  assert.equal((await track.POST(request)).status, 204);
  limiter = null;
  assert.equal((await track.POST(request)).status, 204);
  assert.equal(writes, 1);
});

test("authenticated portal mutations use shared limiter, not SQLite or process memory", async () => {
  for (const path of ["app/api/client/documents/route.ts", "app/api/client/payments/route.ts", "app/api/client/esign/[id]/route.ts"]) {
    const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
    assert.match(source, /await takeSiteRateLimit\(/);
    assert.doesNotMatch(source, /auth\/ratelimit|better-sqlite3|new Map/);
  }
});
