export function emailConfiguration(environment) {
  const names = ["EMAILJS_SERVICE_ID", "EMAILJS_TEMPLATE_ID", "EMAILJS_PUBLIC_KEY", "EMAILJS_PRIVATE_KEY", "SEND_EMAIL_HOOK_SECRET", "RECOVERY_ALLOWED_ORIGINS"];
  const config = Object.fromEntries(names.map(name => [name, environment(name)]));
  if (Object.values(config).some(value => typeof value !== "string" || !value || value.length > 4096)) throw new Error("Recovery email configuration unavailable.");
  const origins = config.RECOVERY_ALLOWED_ORIGINS.split(",").map(value => value.trim());
  for (const origin of origins) {
    const url = new URL(origin);
    const local = url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if ((!local && url.protocol !== "https:") || url.origin !== origin || url.username || url.password) throw new Error("Invalid recovery origin.");
  }
  const inviteTemplate = environment("EMAILJS_INVITE_TEMPLATE_ID");
  const activationOrigins = (environment("ACTIVATION_ALLOWED_ORIGINS") ?? "").split(",").map(value => value.trim()).filter(Boolean);
  let activationConfigured = activationOrigins.length > 0;
  for (const origin of activationOrigins) {
    try {
      const url = new URL(origin);
      const local = url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
      if ((!local && url.protocol !== "https:") || url.origin !== origin || url.username || url.password) activationConfigured = false;
    } catch { activationConfigured = false; }
  }
  return { ...config, origins, inviteTemplate, activationOrigins: activationConfigured ? activationOrigins : [] };
}

async function boundedPayload(request) {
  if (!request.body || Number(request.headers.get("content-length") ?? 0) > 32768) throw new Error("Invalid payload.");
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  const deadline = Date.now() + 5000;
  try {
    while (true) {
      let timer;
      const { done, value } = await Promise.race([
        reader.read(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Invalid payload.")), Math.max(0, deadline - Date.now())); }),
      ]).finally(() => clearTimeout(timer));
      if (done) break;
      size += value.byteLength;
      if (size > 32768) throw new Error("Invalid payload.");
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export async function sendRecoveryEmail(request, config, Webhook, deliver = fetch) {
  const fail = status => new Response(JSON.stringify({ error: { http_code: status, message: "Recovery email unavailable." } }), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  if (request.method !== "POST") return fail(405);
  let payload;
  try {
    const verifier = new Webhook(config.SEND_EMAIL_HOOK_SECRET.replace(/^v1,whsec_/, ""));
    payload = verifier.verify(await boundedPayload(request), Object.fromEntries(request.headers));
  } catch { return fail(401); }
  const { user, email_data: email } = payload ?? {};
  const invite = email?.email_action_type === "invite";
  if (!invite && email?.email_action_type !== "recovery") return fail(400);
  if (typeof user?.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email)
    || typeof email?.token_hash !== "string" || !/^[a-f0-9]{40,128}$/.test(email.token_hash)) return fail(400);
  if (invite) {
    if (user.email_confirmed_at || user.app_metadata?.taxtrax_client_invitation !== "taxtrax-client-invite-v1") return fail(400);
    if (typeof config.inviteTemplate !== "string" || !config.inviteTemplate || config.inviteTemplate === config.EMAILJS_TEMPLATE_ID || config.inviteTemplate.length > 4096 || !config.activationOrigins.length) return fail(503);
    if (!config.activationOrigins.some(origin => email.redirect_to === `${origin}/api/auth/activation/callback`)) return fail(400);
  } else if (typeof user.email_confirmed_at !== "string" || !Number.isFinite(Date.parse(user.email_confirmed_at))
    || !config.origins.some(origin => email.redirect_to === `${origin}/api/auth/recovery/callback`)) return fail(400);
  const recovery = new URL(email.redirect_to);
  recovery.searchParams.set("token_hash", email.token_hash);
  recovery.searchParams.set("type", invite ? "invite" : "recovery");
  try {
    const response = await deliver("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(4000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ service_id: config.EMAILJS_SERVICE_ID, template_id: invite ? config.inviteTemplate : config.EMAILJS_TEMPLATE_ID,
        user_id: config.EMAILJS_PUBLIC_KEY, accessToken: config.EMAILJS_PRIVATE_KEY,
        template_params: invite ? { to_email: user.email, activation_url: recovery.href } : { to_email: user.email, recovery_url: recovery.href } }),
    });
    if (!response.ok) return fail(503);
    return new Response("{}", { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  } catch { return fail(503); }
}
