import { withClient } from "@/lib/portal/guard";
import { saveDocument, MAX_FILE_BYTES, PortalError } from "@/lib/portal/service";
import { takeSiteRateLimit } from "@/lib/site-persistence/client";
import { boundedBody } from "@/lib/portal/body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** multipart/form-data: file, tag, taxYear */
export const POST = (request: Request) => withClient(request, true, async (ctx) => {
  const rl = await takeSiteRateLimit(`client-upload:${ctx.user.id}`, 30, 600);
  if (!rl.ok) return ctx.fail(429, "Too many uploads. Please wait a few minutes and try again.");
  let form: FormData;
  if (!/^multipart\/form-data;\s*boundary=/i.test(request.headers.get("content-type") ?? "")) throw new PortalError(415, "Invalid upload.");
  const bytes = await boundedBody(request, MAX_FILE_BYTES + 1024 * 1024);
  try { form = await new Response(bytes, { headers: { "Content-Type": request.headers.get("content-type") ?? "" } }).formData(); }
  catch { throw new PortalError(400, "Invalid upload."); }
  const file = form.get("file");
  if (!(file instanceof File)) throw new PortalError(400, "Choose a file to upload.");
  if (file.size > MAX_FILE_BYTES) throw new PortalError(413, "That file is larger than 25 MB.");
  const saved = await saveDocument(ctx.db, ctx.user, { name: file.name, bytes: Buffer.from(await file.arrayBuffer()) }, form.get("tag"), form.get("taxYear"));
  return ctx.json(saved, 201);
});
