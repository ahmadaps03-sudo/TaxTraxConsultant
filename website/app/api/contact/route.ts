import { addSiteSubmission } from "@/lib/site-persistence/client";
import { validateContact } from "@/lib/validation";
import { fail, ok, readJson, sameOrigin, csrfFail, clientIp } from "@/lib/http";
import { takeSiteRateLimit } from "@/lib/site-persistence/client";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return csrfFail();
  let rl;
  try { rl = await takeSiteRateLimit(`contact:${clientIp(req)}`, 5, 600); }
  catch { return fail(503, "Contact is temporarily unavailable. Please try again shortly."); }
  if (!rl.ok) return fail(429, "Too many messages. Please wait a few minutes or reach us on WhatsApp.", undefined, { "Retry-After": String(rl.retryAfter) });
  const b = await readJson(req);
  if (!b) return fail(400, "Invalid request.");
  if (typeof b.website === "string" && b.website) return ok(); // honeypot: bots fill hidden fields; pretend success
  const v = validateContact(b);
  if (!v.ok) return fail(400, "Please fix the highlighted fields.", v.fields);
  try { await addSiteSubmission("messages", { read: false, ...v.value }); }
  catch { return fail(503, "Contact is temporarily unavailable. Please try again shortly."); }
  return ok();
}
