// Staff-only gateway for the Client Portal. Same security shape as review-access-requests:
// private Bearer secret verified with HMAC, strict JSON input, no service-role key ever leaves this function.
export const portalActions = ["snapshot", "add_invoice", "void_invoice", "review_payment", "record_payment", "add_checklist", "set_checklist",
  "remove_checklist", "add_esign", "remove_esign", "set_tax_year", "set_document", "document_url"];
const maxBody = 32768; // an e-sign document body may be up to 20,000 characters

export function portalInput(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
  if (Object.keys(body).some(key => !["action", "payload"].includes(key)) || !portalActions.includes(body.action)) throw new Error();
  const payload = body.payload ?? {};
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error();
  return { action: body.action, payload };
}

export async function portalAdmin(request, secret, provider) {
  const reply = (status, body) => new Response(JSON.stringify(body), { status,
    headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  if (request.method !== "POST") return reply(405, { ok: false, error: "Method not allowed." });
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(secret ?? "")) return reply(503, { ok: false, error: "Client portal admin unavailable." });
  const supplied = request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{43,128})$/)?.[1];
  if (!supplied || supplied.length !== secret.length) return reply(403, { ok: false, error: "Request not allowed." });
  const encoder = new TextEncoder();
  const algorithm = { name: "HMAC", hash: "SHA-256" };
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), algorithm, false, ["sign"]);
  const given = await crypto.subtle.importKey("raw", encoder.encode(supplied), algorithm, false, ["verify"]);
  const message = encoder.encode("TaxTrax admin client portal");
  if (!await crypto.subtle.verify("HMAC", given, await crypto.subtle.sign("HMAC", key, message), message)) return reply(403, { ok: false, error: "Request not allowed." });
  if (request.headers.get("content-type") !== "application/json") return reply(415, { ok: false, error: "JSON required." });
  if (!request.body || Number(request.headers.get("content-length") ?? 0) > maxBody) return reply(413, { ok: false, error: "Invalid request." });
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
          if (size > maxBody) throw new Error();
          chunks.push(part.value);
        }
        const buffer = new Uint8Array(size); let offset = 0;
        for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
        return buffer;
      })(),
      new Promise((_, rejectTimeout) => { timer = setTimeout(() => rejectTimeout(new Error()), 5000); }),
    ]);
    input = portalInput(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
  } catch { return reply(400, { ok: false, error: "Invalid request." }); }
  finally { clearTimeout(timer); void reader.cancel().catch(() => {}); }

  try {
    const result = await provider.rpc(input.action === "document_url" ? "document_path" : input.action, input.payload);
    if (result?.code === "ok") {
      if (input.action === "document_url") return reply(200, { ok: true, data: { url: await provider.signedUrl(result.data.path) } });
      return reply(200, { ok: true, data: result.data });
    }
    const failure = { invalid: [400, result?.message || "Please check the values you entered."], not_found: [404, "Not found."],
      conflict: [409, result?.message || "That can't be done right now."] }[result?.code];
    if (failure) return reply(failure[0], { ok: false, error: failure[1] });
    throw new Error();
  } catch { return reply(503, { ok: false, error: "Client portal admin unavailable. Please try again." }); }
}
