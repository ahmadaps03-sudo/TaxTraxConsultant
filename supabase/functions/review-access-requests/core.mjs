export const invitationMarker = "taxtrax-client-invite-v1";
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function reviewData(value) {
  if (Array.isArray(value)) {
    return value.map(reviewData);
  }
  if (!value || typeof value !== "object" || !uuidPattern.test(value.id ?? "")) throw new Error();
  const fields = ["id", "name", "email", "phone", "company", "contact_consent", "status", "created_at", "decided_at", "provisioned_user_id",
    "provisioning_status", "provisioned_at", "invitation_status", "invitation_attempted_at", "invitation_sent_at"];
  return Object.fromEntries(fields.filter(field => Object.hasOwn(value, field)).map(field => [field, value[field]]));
}

export function reviewInput(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
  if (body.action === "list" && Object.keys(body).length === 1) return { action: "list" };
  if (body.action === "list_all" && Object.keys(body).length === 1) return { action: "list_all" };
  if (Object.keys(body).length !== 2 || !Object.hasOwn(body, "id") || !Object.hasOwn(body, "action")
    || typeof body.id !== "string" || !uuidPattern.test(body.id)
    || !["detail", "approve", "reject", "resend_invite", "set_approved", "suspend", "reject_pending"].includes(body.action)) throw new Error();
  return { id: body.id.toLowerCase(), action: body.action };
}

class ReviewError extends Error {
  constructor(code) { super("Review operation unavailable."); this.code = code; }
}

function requireResult(result) {
  if (result?.code !== "ok") throw new ReviewError(["not_found", "conflict", "busy", "ineligible"].includes(result?.code) ? result.code : "unavailable");
  return result;
}

export async function runReview(input, provider) {
  const operation = crypto.randomUUID();
  const rpc = (action, userId) => provider.rpc(action, input.id, operation, userId);
  let claimed = false;
  try {
    const result = requireResult(await rpc(input.action));
    if (!result.claimed) return { status: 200, body: { ok: true, data: reviewData(result.data) } };
    claimed = true;
    let row = result.data;
    let userId = row.provisioned_user_id;
    if (row.provisioning_status !== "ready") {
      let identity = requireResult(await rpc("identity"));
      userId = identity.user_id;
      if (!userId) {
        try {
          const created = await provider.createUser({ email: row.email, email_confirm: false,
            app_metadata: { taxtrax_client_invitation: invitationMarker, taxtrax_access_request_id: row.id } });
          userId = created?.id;
          if (!uuidPattern.test(userId ?? "")) throw new Error();
        } catch {
          identity = requireResult(await rpc("identity"));
          if (!identity.user_id) throw new ReviewError("unavailable");
          userId = identity.user_id;
        }
      }
      row = requireResult(await rpc("provision", userId)).data;
    }
    requireResult(await rpc("invite_start", userId));
    let outcome = "unknown";
    try {
      const sent = await provider.invite(row.email);
      outcome = sent?.outcome === "sent" && sent.userId === userId ? "sent" : sent?.outcome === "failed" ? "failed" : "unknown";
    } catch {}
    row = requireResult(await rpc(`invite_${outcome}`)).data;
    claimed = false;
    return { status: 200, body: { ok: true, data: reviewData(row) } };
  } catch (error) {
    const code = error instanceof ReviewError ? error.code : "unavailable";
    let row;
    if (claimed) {
      try {
        const released = await rpc(code === "ineligible" ? "block" : "error");
        if (released.data) row = reviewData(released.data);
      } catch {}
    }
    const status = code === "not_found" ? 404 : ["conflict", "busy", "ineligible"].includes(code) ? 409 : 503;
    const message = code === "not_found" ? "Request not found." : status === 409
      ? "Request cannot perform this action now. Refresh its details before retrying."
      : "Request review is temporarily unavailable. Refresh its details before retrying.";
    return { status, body: { ok: false, error: message, ...(row ? { data: row } : {}) } };
  }
}

export async function reviewAccessRequests(request, secret, provider) {
  const reply = (status, body) => new Response(JSON.stringify(body), { status,
    headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  if (request.method !== "POST") return reply(405, { ok: false, error: "Method not allowed." });
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(secret ?? "")) return reply(503, { ok: false, error: "Review unavailable." });
  const supplied = request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{43,128})$/)?.[1];
  if (!supplied || supplied.length !== secret.length) return reply(403, { ok: false, error: "Request not allowed." });
  const encoder = new TextEncoder();
  const algorithm = { name: "HMAC", hash: "SHA-256" };
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), algorithm, false, ["sign"]);
  const given = await crypto.subtle.importKey("raw", encoder.encode(supplied), algorithm, false, ["verify"]);
  const message = encoder.encode("TaxTrax admin request review");
  if (!await crypto.subtle.verify("HMAC", given, await crypto.subtle.sign("HMAC", key, message), message)) return reply(403, { ok: false, error: "Request not allowed." });
  if (request.headers.get("content-type") !== "application/json") return reply(415, { ok: false, error: "JSON required." });
  if (!request.body || Number(request.headers.get("content-length") ?? 0) > 4096) return reply(413, { ok: false, error: "Invalid request." });
  const reader = request.body.getReader();
  let timer;
  let input;
  try {
    const bytes = await Promise.race([
      (async () => {
        const chunks = []; let size = 0;
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > 4096) throw new Error();
          chunks.push(part.value);
        }
        const buffer = new Uint8Array(size); let offset = 0;
        for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
        return buffer;
      })(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error()), 5000); }),
    ]);
    input = reviewInput(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
  } catch { return reply(400, { ok: false, error: "Invalid request." }); }
  finally { clearTimeout(timer); void reader.cancel().catch(() => {}); reader.releaseLock(); }
  const result = await runReview(input, provider);
  return reply(result.status, result.body);
}
