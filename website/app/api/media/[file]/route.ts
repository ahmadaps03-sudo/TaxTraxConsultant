import { createReadStream } from "fs";
import { stat } from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { UPLOAD_DIR } from "@/lib/store";

export const dynamic = "force-dynamic";
const MIME: Record<string, string> = { mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime" };

/** Public video streaming with HTTP Range support (needed for seeking in <video>). */
export async function GET(req: Request, { params }: { params: { file: string } }) {
  const name = params.file;
  if (!/^[a-f0-9-]{36}\.(mp4|webm|mov)$/.test(name)) return new Response("Not found", { status: 404 });
  const full = path.join(UPLOAD_DIR, name);
  const st = await stat(full).catch(() => null);
  if (!st) return new Response("Not found", { status: 404 });

  let start = 0, end = st.size - 1, status = 200;
  const headers: Record<string, string> = { "Content-Type": MIME[name.split(".")[1]], "Accept-Ranges": "bytes", "Cache-Control": "public, max-age=86400" };
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") || "");
  if (m && (m[1] || m[2])) {
    if (m[1]) { start = parseInt(m[1], 10); if (m[2]) end = Math.min(parseInt(m[2], 10), st.size - 1); }
    else { start = Math.max(0, st.size - parseInt(m[2], 10)); }
    if (start > end || start >= st.size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${st.size}` } });
    status = 206;
    headers["Content-Range"] = `bytes ${start}-${end}/${st.size}`;
  }
  headers["Content-Length"] = String(end - start + 1);
  return new Response(Readable.toWeb(createReadStream(full, { start, end })) as unknown as ReadableStream, { status, headers });
}
