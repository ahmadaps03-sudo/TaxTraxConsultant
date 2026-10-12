import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { add, list, remove, summary, update, UPLOAD_DIR, type Collection } from "@/lib/store";
import { getAnalytics } from "@/lib/analytics";
import { buildPost, buildVideo } from "@/lib/content";
import { bad, clean, requireAdmin } from "@/lib/api";
import { boundedJson, PortalBodyError } from "@/lib/portal/body";

export const dynamic = "force-dynamic";
const COLS = ["messages", "bookings", "leads", "posts", "videos"];
const STATUSES = ["pending", "confirmed", "done", "cancelled"];
type Ctx = { params: { collection: string } };
const unavailable = () => bad("Site data is temporarily unavailable.", 503);
const adminResponse = (data?: unknown) => NextResponse.json({ ok: true, data }, { headers: { "Cache-Control": "private, no-store" } });
const adminBody = async (request: Request) => {
  try { return await boundedJson(request, 1_000_000); }
  catch (error) {
    if (error instanceof PortalBodyError) return null;
    throw error;
  }
};

export async function GET(req: Request, { params }: Ctx) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  if (![...COLS, "analytics", "summary"].includes(params.collection)) return bad("Not found", 404);
  try {
    if (params.collection === "analytics") return adminResponse(await getAnalytics(30));
    if (params.collection === "summary") return adminResponse(await summary());
    return adminResponse(await list(params.collection as Collection));
  } catch { return unavailable(); }
}

export async function POST(req: Request, { params }: Ctx) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  if (!["posts", "videos"].includes(params.collection)) return bad("Not found", 404);
  const b = await adminBody(req);
  if (!b || typeof b !== "object") return bad("Invalid JSON");
  try {
    const r = params.collection === "posts" ? await buildPost(b, false) : buildVideo(b, false);
    if (!r.data) return bad(r.error ?? "Invalid data");
    return adminResponse(await add(params.collection as "posts" | "videos", r.data));
  } catch { return unavailable(); }
}

export async function PATCH(req: Request, { params }: Ctx) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  if (!["messages", "bookings", "posts", "videos"].includes(params.collection)) return bad("Not found", 404);
  const b = await adminBody(req);
  if (!b) return bad("Invalid JSON");
  const id = clean(b?.id, 80);
  if (!id) return bad("id required");
  let patch: Record<string, unknown> = {};
  try {
    if (params.collection === "messages") { if (typeof b.read === "boolean") patch.read = b.read; }
    else if (params.collection === "bookings") { if (typeof b.status === "string" && STATUSES.includes(b.status)) patch.status = b.status; }
    else {
      const r = params.collection === "posts" ? await buildPost(b, true, id) : buildVideo(b, true);
      if (!r.data) return bad(r.error ?? "Invalid data");
      patch = r.data;
    }
    if (!Object.keys(patch).length) return bad("Nothing to update");
    const row = await update(params.collection as Collection, id, patch);
    return row ? adminResponse(row) : bad("Not found", 404);
  } catch { return unavailable(); }
}

export async function DELETE(req: Request, { params }: Ctx) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  if (!COLS.includes(params.collection)) return bad("Not found", 404);
  const id = clean(new URL(req.url).searchParams.get("id"), 80);
  if (!id) return bad("id required");
  try {
    const row = await remove(params.collection as Collection, id);
    if (!row) return bad("Not found", 404);
    if (params.collection === "videos" && row.kind === "file" && typeof row.file === "string" && /^[a-f0-9-]{36}\.\w+$/.test(row.file)) {
      await fs.unlink(path.join(UPLOAD_DIR, row.file)).catch(() => {});
    }
    return adminResponse();
  } catch { return unavailable(); }
}
