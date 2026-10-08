export function normalizeAccessRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)
    || Object.keys(body).length !== 6 || !["name", "email", "phone", "company", "contact_consent", "website"].every(key => Object.hasOwn(body, key))) throw new Error("Invalid request.");
  const fields = {};
  const text = (key, maximum, minimum = 0) => {
    const value = body[key];
    if (typeof value !== "string" || /[\u0000-\u001f\u007f-\u009f]/u.test(value) || [...value.trim()].length < minimum || [...value.trim()].length > maximum) {
      fields[key] = `Enter a valid ${key}.`;
      return "";
    }
    return value.trim();
  };
  const name = text("name", 100, 2);
  const email = text("email", 254, 3).toLowerCase();
  const [local, domain] = email.split("@");
  if (!local || local.length > 64 || !/^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/i.test(local)
    || !domain || email.split("@").length !== 2 || domain.split(".").length < 2
    || !domain.split(".").every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))) fields.email = "Enter a valid email address.";
  const phone = text("phone", 40, 7);
  const digits = phone.replace(/\D/g, "");
  if (!/^[+\d][\d ().-]*$/.test(phone) || digits.length < 7 || digits.length > 15) fields.phone = "Enter a valid phone number.";
  const company = text("company", 100) || null;
  const website = text("website", 100);
  if (body.contact_consent !== true) fields.agree = "Please confirm so we can contact you.";
  if (Object.keys(fields).length) return { fields };
  return { value: { name, email, phone, company, contact_consent: true }, honeypot: Boolean(website) };
}

export async function submitAccessRequest(request, config, write) {
  const reply = (status, error) => new Response(JSON.stringify(error ? { ok: false, error } : { ok: true }), {
    status, headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" },
  });
  if (request.method !== "POST") return reply(405, "Method not allowed.");
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(config.secret ?? "")) return reply(503, "Request submission unavailable.");
  const supplied = request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{43,128})$/)?.[1] ?? "";
  if (supplied.length !== config.secret.length) return reply(403, "Request not allowed.");
  const algorithm = { name: "HMAC", hash: "SHA-256" };
  const encoder = new TextEncoder();
  const expectedKey = await crypto.subtle.importKey("raw", encoder.encode(config.secret), algorithm, false, ["sign"]);
  const suppliedKey = await crypto.subtle.importKey("raw", encoder.encode(supplied), algorithm, false, ["verify"]);
  const message = encoder.encode("TaxTrax pending access request");
  const proof = await crypto.subtle.sign("HMAC", expectedKey, message);
  if (!await crypto.subtle.verify("HMAC", suppliedKey, proof, message)) return reply(403, "Request not allowed.");
  if (request.headers.get("content-type") !== "application/json") return reply(415, "JSON required.");
  if (Number(request.headers.get("content-length") ?? 0) > 4096 || !request.body) return reply(413, "Invalid request.");
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  let timer;
  try {
    const body = await Promise.race([
      (async () => {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > 4096) throw new Error();
          chunks.push(part.value);
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      })(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error()), 5000); }),
    ]);
    const input = normalizeAccessRequest(body);
    if (!input.value) return reply(400, "Invalid request.");
    if (input.honeypot) return reply(200);
    try { await write(input.value); } catch { return reply(503, "Request submission unavailable."); }
    return reply(200);
  } catch { return reply(400, "Invalid request."); }
  finally { clearTimeout(timer); await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
