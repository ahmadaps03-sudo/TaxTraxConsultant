import { NextResponse } from "next/server";
import { addSiteSubmission } from "@/lib/site-persistence/client";
import { bad, clean, isEmail, limited } from "@/lib/api";
import { readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (limited(req)) return bad("Too many requests", 429);
  const b = await readJson(req);
  if (!b) return bad("Invalid JSON");
  const name = clean(b.name, 120), email = clean(b.email, 200);
  if (!name || !isEmail(email)) return bad("Name and a valid email are required.");
  try { await addSiteSubmission("leads", { name, email, whatsapp: clean(b.whatsapp, 40), reportTitle: clean(b.reportTitle, 160) }); }
  catch { return bad("Lead submissions are temporarily unavailable.", 503); }
  return NextResponse.json({ ok: true });
}
