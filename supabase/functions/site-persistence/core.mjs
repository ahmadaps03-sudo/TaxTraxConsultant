const collections = new Set(["messages", "bookings", "leads", "posts", "videos"]);
const ingestCollections = new Set(["messages", "bookings", "leads"]);
const secretPattern = /^[A-Za-z0-9_-]{43,128}$/;
const hashPattern = /^[0-9a-f]{64}$/;
const maximumBytes = 1_048_576;
const validId = id => typeof id === "string" && id.length >= 1 && id.length <= 120 && !/[\u0000-\u001f\u007f-\u009f]/.test(id);
const videoFile = /^[a-f0-9-]{36}\.(mp4|webm|mov)$/;
const videoTypes = { "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" };

const answer = (status, body) => new Response(JSON.stringify(body), { status,
  headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });

async function capability(request, secrets) {
  const supplied = request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{43,128})$/)?.[1];
  if (!supplied) return null;
  const encoder = new TextEncoder();
  const algorithm = { name: "HMAC", hash: "SHA-256" };
  const message = encoder.encode("TaxTrax site persistence capability");
  for (const scope of ["ingest", "admin"]) {
    const secret = secrets[scope];
    if (!secretPattern.test(secret ?? "") || secret.length !== supplied.length) continue;
    const expected = await crypto.subtle.importKey("raw", encoder.encode(secret), algorithm, false, ["sign"]);
    const candidate = await crypto.subtle.importKey("raw", encoder.encode(supplied), algorithm, false, ["verify"]);
    const proof = await crypto.subtle.sign("HMAC", expected, message);
    if (await crypto.subtle.verify("HMAC", candidate, proof, message)) return scope;
  }
  return null;
}

async function readBody(request) {
  if (request.headers.get("content-type") !== "application/json" || !request.body) throw new Error();
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maximumBytes)) throw new Error();
  const reader = request.body.getReader();
  const parts = [];
  let size = 0;
  const deadline = Date.now() + 5000;
  try {
    while (true) {
      let timer;
      const part = await Promise.race([reader.read(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error()), Math.max(0, deadline - Date.now())); })]).finally(() => clearTimeout(timer));
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maximumBytes) throw new Error();
      parts.push(part.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

function validRecord(collection, data, scope) {
  if (!collections.has(collection) || !data || typeof data !== "object" || Array.isArray(data)
    || Object.hasOwn(data, "id") || Object.hasOwn(data, "createdAt") || Object.hasOwn(data, "created_at")) return false;
  if (scope === "admin") return true;
  if (!ingestCollections.has(collection)) return false;
  const keys = collection === "messages" ? ["read", "name", "email", "phone", "subject", "service", "message"]
    : collection === "bookings" ? ["status", "name", "email", "phone", "date", "time", "service", "revenue", "timeline"]
      : ["name", "email", "whatsapp", "reportTitle"];
  if (Object.keys(data).length !== keys.length || !keys.every(key => Object.hasOwn(data, key))) return false;
  if (collection === "messages" && data.read !== false) return false;
  if (collection === "bookings" && data.status !== "pending") return false;
  return keys.filter(key => !["read", "status"].includes(key)).every(key => typeof data[key] === "string" && data[key].length <= 4000
      && !/[\u0000-\u001f\u007f-\u009f]/.test(data[key]))
    && typeof data.name === "string" && data.name.trim().length >= 2
    && typeof data.email === "string" && data.email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)
    && (collection !== "messages" || data.name.length <= 120 && data.subject.length >= 3 && data.subject.length <= 160 && data.phone.length <= 40 && data.service.length <= 120)
    && (collection !== "messages" || data.message.trim().length >= 10)
    && (collection !== "bookings" || data.date.length > 0 && data.date.length <= 20 && data.time.length > 0 && data.time.length <= 20
      && data.phone.length <= 40 && data.service.length <= 120 && data.revenue.length <= 60 && data.timeline.length <= 60)
    && (collection !== "leads" || data.name.length <= 120 && data.whatsapp.length <= 40 && data.reportTitle.length <= 160);
}

function validView(view) {
  if (!view || typeof view !== "object" || Array.isArray(view) || Object.keys(view).length !== 7) return false;
  const { ts, day, path, country, visitor, referrer, device } = view;
  return typeof ts === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(ts)
    && Number.isFinite(Date.parse(ts)) && typeof day === "string" && day === new Date(ts).toISOString().slice(0, 10)
    && typeof path === "string" && path.startsWith("/") && path.length <= 200 && !/[\u0000-\u001f\u007f]/.test(path)
    && typeof country === "string" && /^[A-Z]{2}$/.test(country)
    && typeof visitor === "string" && /^[0-9a-f]{16}$/.test(visitor)
    && (referrer === null || typeof referrer === "string" && referrer.length <= 80 && !/[\u0000-\u001f\u007f]/.test(referrer))
    && ["desktop", "mobile", "tablet"].includes(device);
}

export async function sitePersistence(request, secrets, provider) {
  if (request.method !== "POST") return answer(405, { ok: false, error: "Method not allowed." });
  if (!secretPattern.test(secrets.ingest ?? "") || !secretPattern.test(secrets.admin ?? "") || secrets.ingest === secrets.admin) {
    return answer(503, { ok: false, error: "Site persistence unavailable." });
  }
  const scope = await capability(request, secrets);
  if (!scope) return answer(403, { ok: false, error: "Request not allowed." });
  let input;
  try { input = await readBody(request); } catch { return answer(400, { ok: false, error: "Invalid request." }); }
  if (!input || typeof input !== "object" || Array.isArray(input) || typeof input.action !== "string") {
    return answer(400, { ok: false, error: "Invalid request." });
  }
  const fields = Object.keys(input).sort().join(",");
  try {
    if (input.action === "rate_limit" && fields === "action,hash,max,windowSeconds" && scope === "ingest"
      && hashPattern.test(input.hash) && Number.isInteger(input.max) && input.max >= 1 && input.max <= 10000
      && Number.isInteger(input.windowSeconds) && input.windowSeconds >= 1 && input.windowSeconds <= 86400) {
      return answer(200, { ok: true, data: await provider.rateLimit(input.hash, input.max, input.windowSeconds) });
    }
    if (input.action === "record_add" && fields === "action,collection,data" && validRecord(input.collection, input.data, scope)) {
      return answer(200, { ok: true, data: await provider.add(input.collection, input.data) });
    }
    if (input.action === "record_list" && fields === "action,collection" && scope === "admin" && collections.has(input.collection)) {
      return answer(200, { ok: true, data: await provider.list(input.collection) });
    }
    if (input.action === "record_update" && fields === "action,collection,id,patch" && scope === "admin"
      && collections.has(input.collection) && validId(input.id) && validRecord(input.collection, input.patch, "admin")
      && Object.keys(input.patch).length > 0) {
      return answer(200, { ok: true, data: await provider.update(input.collection, input.id, input.patch) });
    }
    if (input.action === "record_delete" && fields === "action,collection,id" && scope === "admin"
      && collections.has(input.collection) && validId(input.id)) {
      return answer(200, { ok: true, data: await provider.remove(input.collection, input.id) });
    }
    if (input.action === "video_upload_sign" && fields === "action,contentType,size" && scope === "admin"
      && Object.hasOwn(videoTypes, input.contentType) && Number.isInteger(input.size)
      && input.size > 0 && input.size <= 50 * 1024 * 1024) {
      return answer(200, { ok: true, data: await provider.signVideoUpload(input.size, input.contentType) });
    }
    if (input.action === "video_upload_cleanup" && fields === "action,file" && scope === "admin"
      && videoFile.test(input.file)) {
      await provider.cleanupVideoUpload(input.file);
      return answer(200, { ok: true });
    }
    if (input.action === "video_playback_sign" && fields === "action,file" && scope === "ingest"
      && videoFile.test(input.file)) {
      const signed = await provider.signVideoPlayback(input.file);
      return signed ? answer(200, { ok: true, data: signed }) : answer(404, { ok: false, error: "Not found." });
    }
    if (input.action === "video_orphan_cleanup" && fields === "action,dryRun" && scope === "admin"
      && typeof input.dryRun === "boolean") {
      return answer(200, { ok: true, data: await provider.cleanupVideoOrphans(input.dryRun) });
    }
    if (input.action === "page_view" && fields === "action,view" && scope === "ingest" && validView(input.view)) {
      await provider.pageView(input.view);
      return answer(200, { ok: true });
    }
    if (input.action === "analytics_summary" && fields === "action,days" && scope === "admin"
      && Number.isInteger(input.days) && input.days >= 1 && input.days <= 90) {
      return answer(200, { ok: true, data: await provider.analytics(input.days) });
    }
    if (input.action === "active_client_count" && fields === "action" && scope === "admin") {
      return answer(200, { ok: true, data: await provider.activeClientCount() });
    }
    if (input.action === "telemetry_prune" && fields === "action" && scope === "admin") {
      await provider.pruneTelemetry();
      return answer(200, { ok: true });
    }
    return answer(400, { ok: false, error: "Invalid request." });
  } catch { return answer(503, { ok: false, error: "Site persistence unavailable." }); }
}
