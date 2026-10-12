import { withClient, jsonBody } from "@/lib/portal/guard";
import { reportPayment } from "@/lib/portal/service";
import { rateLimit } from "@/lib/auth/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Body: { invoiceId, amount, method, reference, note? }. The payment stays "Pending Review" until staff confirm it. */
export const POST = (request: Request) => withClient(request, true, async (ctx) => {
  if (!rateLimit(`client-pay:${ctx.user.id}`, 15, 3600).ok) return ctx.fail(429, "Too many payment submissions. Please try again later.");
  return ctx.json(await reportPayment(ctx.db, await jsonBody(request)), 201);
});
