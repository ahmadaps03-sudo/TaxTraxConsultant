import { NextResponse } from "next/server";
import { AdminError, adminAction, adminSnapshot } from "@/lib/portal/admin";
import { bad, requireAdmin } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const guard = (req: Request) => {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const origin = req.headers.get("origin"); // the desktop app sends none; browsers must come from our own origin
  if (origin !== null && origin !== process.env.AUTH_ORIGIN) return bad("Request not allowed.", 403);
  return null;
};
const fail = (e: unknown) => { if (e instanceof AdminError) return bad(e.message, e.status); console.error("[admin-clientdata]", e); return bad("Server error", 500); };
const json = (data: unknown) => { const res = NextResponse.json({ ok: true, data }); res.headers.set("Cache-Control", "private, no-store"); return res; };

/** Desktop admin: every client with their portal data (read through the portal-admin Edge Function). */
export async function GET(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  try { return json(await adminSnapshot()); } catch (e) { return fail(e); }
}

/** Desktop admin: one action per call, e.g. { action: "addInvoice", userId, description, amount }. */
export async function POST(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return bad("Invalid JSON");
  try { return json(await adminAction(body)); } catch (e) { return fail(e); }
}
