import { NextResponse } from "next/server";
import { bad, requireAdmin } from "@/lib/api";
import { boundedJson, PortalBodyError } from "@/lib/portal/body";
import { cleanupSiteVideoUpload, signSiteVideoUpload } from "@/lib/site-persistence/client";

export const dynamic = "force-dynamic";
const MAX = 50 * 1024 * 1024;
const TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const FILE = /^[a-f0-9-]{36}\.(mp4|webm|mov)$/;
const unavailable = () => bad("Video storage is temporarily unavailable.", 503);

export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  let body: Record<string, unknown>;
  try { body = await boundedJson(request, 2000); }
  catch (error) { return bad(error instanceof PortalBodyError && error.status === 413 ? "Request too large." : "Invalid JSON", error instanceof PortalBodyError && error.status === 413 ? 413 : 400); }
  if (Object.keys(body).sort().join(",") !== "contentType,size" || !TYPES.has(body.contentType as string)) return bad("Unsupported video type.", 415);
  if (!Number.isInteger(body.size) || Number(body.size) < 1 || Number(body.size) > MAX) return bad("Video must be 50 MB or smaller.", 413);
  try {
    const data = await signSiteVideoUpload(Number(body.size), body.contentType as string);
    return NextResponse.json({ ok: true, data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return unavailable(); }
}

export async function DELETE(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  const file = new URL(request.url).searchParams.get("file");
  if (!file || !FILE.test(file)) return bad("Invalid video file.");
  try {
    await cleanupSiteVideoUpload(file);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return unavailable(); }
}
