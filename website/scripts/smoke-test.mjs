// End-to-end check of the website API. Usage:
//   ADMIN_API_KEY=yourkey node scripts/smoke-test.mjs [http://localhost:3000]
const base = process.argv[2] || "http://localhost:3000";
const key = process.env.ADMIN_API_KEY;
if (!key) { console.error("Set ADMIN_API_KEY to the same value as in .env.local"); process.exit(1); }

let failed = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name} ${ok ? "" : extra}`); if (!ok) failed++; };
const call = async (path, method = "GET", body, k = key) => {
  const r = await fetch(base + path, { method, headers: { "content-type": "application/json", "x-admin-key": k }, body: body && JSON.stringify(body) });
  return { status: r.status, json: await r.json().catch(() => ({})) };
};

const tag = "smoke-" + Date.now();
let r = await call("/api/contact", "POST", { name: tag, email: "smoke@example.com", phone: "+92 300 1234567", subject: "Smoke test", message: "hello from the smoke test" });
check("contact form accepts valid message", r.status === 200 && r.json.ok, JSON.stringify(r));
r = await call("/api/contact", "POST", { name: "x", email: "not-an-email", phone: "", message: "hi" });
check("contact form rejects bad email", r.status === 400);
r = await call("/api/contact", "POST", { name: tag, email: "smoke@example.com", phone: "", subject: "No phone", message: "this has no phone number" });
check("contact form requires a phone number", r.status === 400 && !!r.json.fields?.phone);
r = await call("/api/bookings", "POST", { name: tag, email: "smoke@example.com", phone: "", date: "2026-10-15", time: "10:00 AM" });
check("booking requires a phone number", r.status === 400 && !!r.json.fields?.phone);
r = await call("/api/bookings", "POST", { name: tag, email: "smoke@example.com", phone: "03001234567", service: "usa-llc-tax-filing", date: "2026-10-15", time: "10:00 AM" });
check("booking accepted", r.status === 200 && r.json.ok, JSON.stringify(r));
r = await call("/api/leads", "POST", { name: tag, email: "smoke@example.com", whatsapp: "123", reportTitle: "Salary Tax" });
check("lead accepted", r.status === 200 && r.json.ok, JSON.stringify(r));

r = await call("/api/admin/messages", "GET", undefined, "wrong-key-wrong-key");
check("admin rejects wrong key", r.status === 401 || r.status === 503, String(r.status));
r = await call("/api/admin/summary");
check("admin summary works", r.status === 200 && r.json.data?.totalMessages >= 1, JSON.stringify(r));
r = await call("/api/admin/messages");
const msg = r.json.data?.find((m) => m.name === tag);
check("message visible to admin", !!msg && msg.read === false);
r = await call("/api/admin/messages", "PATCH", { id: msg?.id, read: true });
check("message can be marked read", r.status === 200 && r.json.data?.read === true);
r = await call("/api/admin/bookings");
const bk = r.json.data?.find((b) => b.name === tag);
check("booking visible to admin (pending)", bk?.status === "pending");
r = await call("/api/admin/bookings", "PATCH", { id: bk?.id, status: "confirmed" });
check("booking can be confirmed", r.status === 200 && r.json.data?.status === "confirmed");
r = await call("/api/admin/leads");
check("lead visible to admin", !!r.json.data?.find((l) => l.name === tag));

// ---- blog + videos + public pages ----
const text = async (path) => { const r = await fetch(base + path); return { status: r.status, body: await r.text() }; };
r = await call("/api/admin/posts", "POST", { title: "Smoke Post " + tag, category: "Test", content: "First paragraph.\n\nSecond paragraph.", excerpt: "Smoke excerpt" });
const post = r.json.data;
check("admin can create a blog post", r.status === 200 && !!post?.slug, JSON.stringify(r));
let pg = await text("/blog/" + post?.slug);
check("new post is live on the public site", pg.status === 200 && pg.body.includes("Smoke Post " + tag));
check("blog index lists it", (await text("/blog")).body.includes("Smoke Post " + tag));
check("sitemap includes it", (await text("/sitemap.xml")).body.includes("/blog/" + post?.slug));
r = await call("/api/admin/posts", "PATCH", { id: post?.id, published: false });
check("post can be unpublished", r.status === 200 && r.json.data?.published === false);
check("unpublished post returns 404", (await text("/blog/" + post?.slug)).status === 404);
r = await call("/api/admin/posts?id=" + post?.id, "DELETE");
check("post can be deleted", r.status === 200);

r = await call("/api/admin/videos", "POST", { kind: "youtube", youtube: "https://youtu.be/aqz-KE-bpKQ", title: "Smoke Video " + tag, category: "Test" });
const vid = r.json.data;
check("admin can add a YouTube video", r.status === 200 && vid?.youtubeId === "aqz-KE-bpKQ", JSON.stringify(r));
check("video shows on Resources page", (await text("/resources")).body.includes("Smoke Video " + tag));
r = await call("/api/admin/videos", "POST", { kind: "youtube", youtube: "not a link", title: "x" });
check("bad YouTube link rejected", r.status === 400);

// real file upload (tiny fake mp4 body) then public streaming with Range
const up = await fetch(base + "/api/admin/upload", { method: "POST", headers: { "x-admin-key": key, "content-type": "video/mp4" }, body: new Uint8Array(2048) });
const upj = await up.json();
check("video file upload works", up.status === 200 && !!upj.data?.file, JSON.stringify(upj));
const bad = await fetch(base + "/api/admin/upload", { method: "POST", headers: { "x-admin-key": key, "content-type": "text/html" }, body: "<b>x</b>" });
check("non-video upload rejected", bad.status === 415);
const rng = await fetch(base + "/api/media/" + upj.data?.file, { headers: { range: "bytes=0-99" } });
check("media streams with Range (206)", rng.status === 206 && (await rng.arrayBuffer()).byteLength === 100);
r = await call("/api/admin/videos", "POST", { kind: "file", file: upj.data?.file, title: "File " + tag });
check("uploaded file attached to a video record", r.status === 200);
for (const row of [vid, r.json.data]) if (row) await call("/api/admin/videos?id=" + row.id, "DELETE");
check("deleting a video removes its file", (await fetch(base + "/api/media/" + upj.data?.file)).status === 404);

// ---- analytics ----
r = await call("/api/admin/analytics");
check("admin analytics endpoint works", r.status === 200 && Array.isArray(r.json.data?.byDay) && r.json.data.byDay.length === 30, JSON.stringify(r).slice(0, 200));

// ---- pricing must not be shown on services ----
const svc = await text("/services");
check("services page loads", svc.status === 200);
check("services page has WhatsApp pricing CTA", svc.body.includes("wa.me"));
check("robots.txt blocks /api/", (await text("/robots.txt")).body.includes("Disallow: /api/"));

console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
