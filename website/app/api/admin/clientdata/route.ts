import { NextResponse } from "next/server";
import { AdminError, adminAction, adminSnapshot } from "@/lib/portal/admin";
import { bad, requireAdmin } from "@/lib/api";
import { boundedJson, PortalBodyError } from "@/lib/portal/body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const guard = (req: Request) => {
  const denied = requireAdmin(req);
  if (denied) return error(denied.status === 401 ? "Unauthorized" : "Admin unavailable.", denied.status);
  const origin = req.headers.get("origin"); // the desktop app sends none; browsers must come from our own origin
  if (origin !== null && origin !== process.env.AUTH_ORIGIN) return error("Request not allowed.", 403);
  const site = req.headers.get("sec-fetch-site");
  if (site !== null && !["same-origin", "none"].includes(site)) return error("Request not allowed.", 403);
  return null;
};
const fail = (e: unknown) => {
  if (e instanceof PortalBodyError) return error(e.status === 413 ? "Request too large." : "Invalid request.", e.status);
  if (e instanceof AdminError) return error(e.message, e.status);
  console.error("[admin-clientdata] request_failed");
  return error("Server error", 500);
};
const error = (message: string, status: number) => { const res = bad(message, status); res.headers.set("Cache-Control", "private, no-store"); return res; };
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
  try { return json(await adminAction(await boundedJson(req, 32_768))); } catch (e) { return fail(e); }
}
