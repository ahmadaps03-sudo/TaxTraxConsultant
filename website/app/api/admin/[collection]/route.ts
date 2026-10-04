import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { add, list, remove, summary, update, UPLOAD_DIR, type Collection } from "@/lib/store";
import { getAnalytics } from "@/lib/analytics";
import { buildPost, buildVideo } from "@/lib/content";
import { bad, clean, requireAdmin } from "@/lib/api";

export const dynamic = "force-dynamic";
const COLS = ["messages", "bookings", "leads", "posts", "videos"];
const STATUSES = ["pending", "confirmed", "done", "cancelled"];
type Ctx = { params: { collection: string } };

export async function GET(req: Request, { params }: Ctx) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  if (params.collection === "analytics") return NextResponse.json({ ok: true, data: await getAnalytics(30) });
  if (params.collection === "summary") return NextResponse.json({ ok: true, data: await summary() });
  if (!COLS.includes(params.collection)) return bad("Not found", 404);
  return NextResponse.json({ ok: true, data: await list(params.collection as Collection) });
}

export async function POST(req: Request, { params }: Ctx) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  if (!["posts", "videos"].includes(params.collection)) return bad("Not found", 404);
  const b = await req.json().catch(() => null);
  if (!b || typeof b !== "object") return bad("Invalid JSON");
  const r = params.collection === "posts" ? await buildPost(b, false) : buildVideo(b, false);
  if (!r.data) return bad(r.error ?? "Invalid data");
  return NextResponse.json({ ok: true, data: await add(params.collection as Collection, r.data) });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  if (!["messages", "bookings", "posts", "videos"].includes(params.collection)) return bad("Not found", 404);
  const b = await req.json().catch(() => null);
  const id = clean(b?.id, 80);
  if (!id) return bad("id required");
  let patch: Record<string, unknown> = {};
  if (params.collection === "messages") { if (typeof b.read === "boolean") patch.read = b.read; }
  else if (params.collection === "bookings") { if (STATUSES.includes(b.status)) patch.status = b.status; }
  else {
    const r = params.collection === "posts" ? await buildPost(b, true, id) : buildVideo(b, true);
    if (!r.data) return bad(r.error ?? "Invalid data");
    patch = r.data;
  }
  if (!Object.keys(patch).length) return bad("Nothing to update");
  const row = await update(params.collection as Collection, id, patch);
  return row ? NextResponse.json({ ok: true, data: row }) : bad("Not found", 404);
}

export async function DELETE(req: Request, { params }: Ctx) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  if (!COLS.includes(params.collection)) return bad("Not found", 404);
  const id = clean(new URL(req.url).searchParams.get("id"), 80);
  if (!id) return bad("id required");
  const row = await remove(params.collection as Collection, id);
  if (!row) return bad("Not found", 404);
  if (params.collection === "videos" && row.kind === "file" && typeof row.file === "string" && /^[a-f0-9-]{36}\.\w+$/.test(row.file)) {
    await fs.unlink(path.join(UPLOAD_DIR, row.file)).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
