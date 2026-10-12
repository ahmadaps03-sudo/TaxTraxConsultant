import { withClient, jsonBody } from "@/lib/portal/guard";
import { cleanupDocumentUpload } from "@/lib/portal/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DELETE = (request: Request) => withClient(request, true, async (ctx) => {
  const body = await jsonBody(request);
  if (Object.keys(body).join(",") !== "path") return ctx.fail(400, "Invalid upload.");
  await cleanupDocumentUpload(ctx.db, ctx.user, body.path);
  return ctx.json({});
});
