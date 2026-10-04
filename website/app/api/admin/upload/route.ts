import { NextResponse } from "next/server";
import { createWriteStream } from "fs";
import { mkdir, unlink } from "fs/promises";
import { randomUUID } from "crypto";
import path from "path";
import { Readable, Transform } from "stream";
import { pipeline } from "stream/promises";
import { UPLOAD_DIR } from "@/lib/store";
import { bad, requireAdmin } from "@/lib/api";

export const dynamic = "force-dynamic";
const TYPES: Record<string, string> = { "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" };
const MAX = 500 * 1024 * 1024; // 500 MB

/** Raw-body upload: POST the file bytes with the video's Content-Type. Returns the stored file name. */
export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const ext = TYPES[(req.headers.get("content-type") || "").split(";")[0].trim()];
  if (!ext) return bad("Only MP4, WebM or MOV videos are allowed.", 415);
  if (Number(req.headers.get("content-length") || 0) > MAX) return bad("File is larger than 500 MB.", 413);
  if (!req.body) return bad("Empty upload");

  await mkdir(UPLOAD_DIR, { recursive: true });
  const file = `${randomUUID()}.${ext}`;
  const dest = path.join(UPLOAD_DIR, file);
  let bytes = 0;
  const cap = new Transform({ transform(chunk, _e, cb) { bytes += chunk.length; bytes > MAX ? cb(new Error("too large")) : cb(null, chunk); } });
  try {
    await pipeline(Readable.fromWeb(req.body as unknown as import("stream/web").ReadableStream), cap, createWriteStream(dest));
  } catch {
    await unlink(dest).catch(() => {});
    return bad("Upload failed or file too large.", 413);
  }
  return NextResponse.json({ ok: true, data: { file } });
}
