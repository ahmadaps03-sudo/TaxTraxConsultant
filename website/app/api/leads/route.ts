import { NextResponse } from "next/server";
import { add } from "@/lib/store";
import { bad, clean, isEmail, limited } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (limited(req)) return bad("Too many requests", 429);
  const b = await req.json().catch(() => null);
  if (!b) return bad("Invalid JSON");
  const name = clean(b.name, 120), email = clean(b.email, 200);
  if (!name || !isEmail(email)) return bad("Name and a valid email are required.");
  await add("leads", { name, email, whatsapp: clean(b.whatsapp, 40), reportTitle: clean(b.reportTitle, 160) });
  return NextResponse.json({ ok: true });
}
