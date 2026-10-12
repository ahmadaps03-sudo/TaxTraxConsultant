import { NextResponse } from "next/server";
import { addSiteSubmission } from "@/lib/site-persistence/client";
import { bad, clean, isEmail } from "@/lib/api";
import { clientIp, readJson } from "@/lib/http";
import { takeSiteRateLimit } from "@/lib/site-persistence/client";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try { if (!(await takeSiteRateLimit(`lead:${clientIp(req)}`, 15, 60)).ok) return bad("Too many requests", 429); }
  catch { return bad("Lead submissions are temporarily unavailable.", 503); }
  const b = await readJson(req);
  if (!b) return bad("Invalid JSON");
  const name = clean(b.name, 120), email = clean(b.email, 200);
  if (!name || !isEmail(email)) return bad("Name and a valid email are required.");
  try { await addSiteSubmission("leads", { name, email, whatsapp: clean(b.whatsapp, 40), reportTitle: clean(b.reportTitle, 160) }); }
  catch { return bad("Lead submissions are temporarily unavailable.", 503); }
  return NextResponse.json({ ok: true });
}
