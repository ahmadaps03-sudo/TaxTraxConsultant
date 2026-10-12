import { withClient } from "@/lib/portal/guard";
import { beginDocumentUpload } from "@/lib/portal/service";
import { takeSiteRateLimit } from "@/lib/site-persistence/client";
import { jsonBody } from "@/lib/portal/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = (request: Request) => withClient(request, true, async (ctx) => {
  const rl = await takeSiteRateLimit(`client-upload:${ctx.user.id}`, 30, 600);
  if (!rl.ok) return ctx.fail(429, "Too many uploads. Please wait a few minutes and try again.");
  return ctx.json(await beginDocumentUpload(ctx.db, ctx.user, await jsonBody(request)), 201);
});
