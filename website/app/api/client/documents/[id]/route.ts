import { withClient } from "@/lib/portal/guard";
import { deleteDocument, documentFile } from "@/lib/portal/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: { id: string } };

/** Redirect the authorized client to a short-lived private Storage attachment URL. */
export const GET = (request: Request, { params }: Ctx) => withClient(request, false, async (ctx) => {
  const location = await documentFile(ctx.db, ctx.user, params.id);
  return ctx.binary(new Response(null, { status: 303, headers: { Location: location, "Referrer-Policy": "no-referrer" } }));
});

export const DELETE = (request: Request, { params }: Ctx) => withClient(request, true, async (ctx) => { await deleteDocument(ctx.db, params.id); return ctx.json({}); });
