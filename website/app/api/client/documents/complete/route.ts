import { withClient, jsonBody } from "@/lib/portal/guard";
import { completeDocumentUpload } from "@/lib/portal/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = (request: Request) => withClient(request, true, async (ctx) =>
  ctx.json(await completeDocumentUpload(ctx.db, ctx.user, await jsonBody(request)), 201));
