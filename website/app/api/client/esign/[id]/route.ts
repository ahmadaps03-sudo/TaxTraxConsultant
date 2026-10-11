import { withClient, jsonBody } from "@/lib/portal/guard";
import { signRequest } from "@/lib/portal/service";
import { rateLimit } from "@/lib/auth/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Body: { typedName: string, agree: true } */
export const POST = (request: Request, { params }: { params: { id: string } }) => withClient(request, true, async (ctx) => {
  if (!rateLimit(`client-sign:${ctx.user.id}`, 20, 600).ok) return ctx.fail(429, "Too many attempts. Please wait a few minutes.");
  const b = await jsonBody(request);
  await signRequest(ctx.db, params.id, b.typedName, b.agree, { ip: ctx.ip, ua: ctx.ua });
  return ctx.json({});
});
