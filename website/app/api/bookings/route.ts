import { addSiteSubmission } from "@/lib/site-persistence/client";
import { validateBooking } from "@/lib/validation";
import { fail, ok, readJson, sameOrigin, csrfFail, clientIp } from "@/lib/http";
import { takeSiteRateLimit } from "@/lib/site-persistence/client";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return csrfFail();
  let rl;
  try { rl = await takeSiteRateLimit(`booking:${clientIp(req)}`, 8, 600); }
  catch { return fail(503, "Booking requests are temporarily unavailable. Please try again shortly."); }
  if (!rl.ok) return fail(429, "Too many booking requests. Please try again shortly or message us on WhatsApp.", undefined, { "Retry-After": String(rl.retryAfter) });
  const b = await readJson(req);
  if (!b) return fail(400, "Invalid request.");
  const v = validateBooking(b);
  if (!v.ok) return fail(400, "Name, email and phone number are required.", v.fields);
  try { await addSiteSubmission("bookings", { status: "pending", ...v.value }); }
  catch { return fail(503, "Booking requests are temporarily unavailable. Please try again shortly."); }
  return ok();
}
