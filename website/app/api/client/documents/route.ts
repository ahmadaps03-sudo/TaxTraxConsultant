import { withClient } from "@/lib/portal/guard";
import { saveDocument, MAX_FILE_BYTES, PortalError } from "@/lib/portal/service";
import { rateLimit } from "@/lib/auth/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** multipart/form-data: file, tag, taxYear */
export const POST = (request: Request) => withClient(request, true, async (ctx) => {
  const rl = rateLimit(`client-upload:${ctx.user.id}`, 30, 600);
  if (!rl.ok) return ctx.fail(429, "Too many uploads. Please wait a few minutes and try again.");
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_FILE_BYTES + 1024 * 1024) throw new PortalError(413, "That file is larger than 25 MB.");
  let form: FormData;
  try { form = await request.formData(); } catch { throw new PortalError(400, "Invalid upload."); }
  const file = form.get("file");
  if (!(file instanceof File)) throw new PortalError(400, "Choose a file to upload.");
  if (file.size > MAX_FILE_BYTES) throw new PortalError(413, "That file is larger than 25 MB.");
  const saved = await saveDocument(ctx.db, ctx.user, { name: file.name, bytes: Buffer.from(await file.arrayBuffer()) }, form.get("tag"), form.get("taxYear"));
  return ctx.json(saved, 201);
});
