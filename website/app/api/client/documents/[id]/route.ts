import { withClient } from "@/lib/portal/guard";
import { deleteDocument, documentFile } from "@/lib/portal/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: { id: string } };

/** Download the client's OWN document (streamed from private Storage, always as an attachment). */
export const GET = (request: Request, { params }: Ctx) => withClient(request, false, async (ctx) => {
  const f = await documentFile(ctx.db, ctx.user, params.id);
  const ascii = f.name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return ctx.binary(new Response(f.stream, { headers: {
    "Content-Type": f.mime, "Content-Length": String(f.size), "X-Content-Type-Options": "nosniff",
    "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(f.name)}`,
  } }));
});

export const DELETE = (request: Request, { params }: Ctx) => withClient(request, true, async (ctx) => { await deleteDocument(ctx.db, params.id); return ctx.json({}); });
