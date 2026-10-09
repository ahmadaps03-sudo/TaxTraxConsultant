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
  return { ...config, origins, inviteTemplate, activationOrigins: activationConfigured ? activationOrigins : [], welcomeSecret: environment("WELCOME_EMAIL_SECRET") };
}

export function accountTemplateParams(kind, toEmail, buttonUrl) {
  if (!["activation", "welcome"].includes(kind) || typeof toEmail !== "string" || typeof buttonUrl !== "string") throw new Error("Invalid email.");
  const activation = kind === "activation";
  return {
    to_email: toEmail,
    subject: activation ? "Your TaxTrax account is approved — set it up" : "Welcome to TaxTrax",
    preheader: activation ? "Verify your email and choose your first password." : "Your Client Portal setup is complete.",
    badge_text: activation ? "ACCOUNT APPROVED" : "WELCOME",
    badge_bg: "#edf5f1", badge_border: "#bed8ca", badge_color: "#24543d",
    heading: activation ? "Set up your Client Portal account" : "Your Client Portal is ready",
    message: activation ? "Your access request has been approved. Verify your email and choose a password to finish setting up your account. You can sign in after setup is complete."
      : "Your account setup is complete. You can now sign in to the Client Portal with the password you created.",
    button_label: activation ? "Set up account" : "Sign in",
    button_url: buttonUrl,
    button_note: activation ? "This secure setup link expires. If it no longer works, contact the TaxTrax team." : "Use the email address you verified during setup.",
    step1_bg: "#edf5f1", step1_fg: "#24543d",
    step1_title: activation ? "Verify your email" : "Email verified",
    step1_desc: activation ? "Open the secure setup link above." : "Your invitation was verified.",
    step2_bg: "#edf5f1", step2_fg: "#24543d",
    step2_title: activation ? "Choose a password" : "Password created",
    step2_desc: activation ? "Create your private password on the secure setup page." : "Your first password has been set.",
    step3_bg: "#edf5f1", step3_fg: "#24543d",
    step3_title: activation ? "Sign in" : "Access your portal",
    step3_desc: activation ? "Return to the Client Portal and sign in." : "Sign in with your verified email and password.",
    notice: activation ? "TaxTrax will never ask you to email your password." : "TaxTrax will never ask you to email your password.",
    footer_note: activation ? "If you did not request access, contact the TaxTrax team." : "If you did not set up this account, contact the TaxTrax team.",
  };
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
    if (config.inviteTemplate !== "template_p5rfdor" || !config.activationOrigins.length) return fail(503);
    if (!config.activationOrigins.some(origin => email.redirect_to === `${origin}/api/auth/activation/callback`)) return fail(400);
  } else if (config.EMAILJS_TEMPLATE_ID !== "template_2ov11np" || typeof user.email_confirmed_at !== "string" || !Number.isFinite(Date.parse(user.email_confirmed_at))
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
        template_params: invite ? accountTemplateParams("activation", user.email, recovery.href) : { to_email: user.email, recovery_url: recovery.href } }),
    });
    if (!response.ok) return fail(503);
    return new Response("{}", { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  } catch { return fail(503); }
}

export async function sendWelcomeEmail(request, config, deliver = fetch) {
  const fail = status => new Response('{"error":"Welcome email unavailable."}', { status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  if (request.method !== "POST") return fail(405);
  if (request.headers.get("x-taxtrax-email-action") !== "welcome") return fail(403);
  const secret = config.welcomeSecret;
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(secret ?? "") || config.inviteTemplate !== "template_p5rfdor" || !config.activationOrigins.length) return fail(503);
  const supplied = request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{43,128})$/)?.[1];
  if (!supplied || supplied.length !== secret.length) return fail(403);
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const given = await crypto.subtle.importKey("raw", encoder.encode(supplied), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const message = encoder.encode("TaxTrax completed account setup");
  if (!await crypto.subtle.verify("HMAC", given, await crypto.subtle.sign("HMAC", key, message), message)) return fail(403);
  if (request.headers.get("content-type") !== "application/json") return fail(415);
  let payload;
  try { payload = JSON.parse(await boundedPayload(request)); } catch { return fail(400); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || Object.keys(payload).length !== 1
    || typeof payload.to_email !== "string" || payload.to_email.length > 254
    || /[\u0000-\u001f\u007f-\u009f]/u.test(payload.to_email)
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.to_email)) return fail(400);
  try {
    const result = await deliver("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(4000), headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ service_id: config.EMAILJS_SERVICE_ID, template_id: config.inviteTemplate,
        user_id: config.EMAILJS_PUBLIC_KEY, accessToken: config.EMAILJS_PRIVATE_KEY,
        template_params: accountTemplateParams("welcome", payload.to_email, `${config.activationOrigins[0]}/portal`) }),
    });
    if (!result.ok) return fail(503);
    return new Response("{}", { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  } catch { return fail(503); }
}
