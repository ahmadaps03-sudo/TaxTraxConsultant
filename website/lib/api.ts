import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";

export const clean = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
export const bad = (msg: string, status = 400) => NextResponse.json({ ok: false, error: msg }, { status });

// Simple in-memory limiter for the public form endpoints (per IP, per minute).
const hits = new Map<string, { n: number; t: number }>();
export function limited(req: Request, max = 15) {
  const ip = (req.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.t > 60_000) { hits.set(ip, { n: 1, t: now }); return false; }
  h.n += 1;
  return h.n > max;
}

/** Returns an error response if the admin key is missing/wrong, otherwise null. */
export function requireAdmin(req: Request) {
  const expected = process.env.ADMIN_API_KEY;
  if (!expected || expected.length < 16) return bad("Admin API disabled: set ADMIN_API_KEY (16+ chars) on the server.", 503);
  const given = req.headers.get("x-admin-key") || "";
  // Hash both sides so the comparison is constant-time and length-independent.
  const digest = (v: string) => new Uint8Array(createHash("sha256").update(v).digest());
  if (!timingSafeEqual(digest(given), digest(expected))) return bad("Unauthorized", 401);
  return null;
}
