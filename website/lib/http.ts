import { NextResponse } from "next/server";
import { getUserByToken, tokenFromRequest, type SessionUser } from "./auth/session";

export const ok = (data?: unknown, init?: ResponseInit) => NextResponse.json({ ok: true, data }, init);
export const fail = (status: number, error: string, fields?: Record<string, string>, headers?: Record<string, string>) =>
  NextResponse.json({ ok: false, error, fields }, { status, headers });

/** Client IP. Only trusts X-Forwarded-For when TRUST_PROXY=1 (i.e. you run behind your own proxy/CDN). */
export function clientIp(req: Request) {
  if (process.env.TRUST_PROXY === "1") { const x = req.headers.get("x-forwarded-for"); if (x) return x.split(",")[0].trim(); }
  return req.headers.get("x-real-ip") || "unknown";
}

/** CSRF defence in depth (on top of SameSite=Lax cookies): browsers always send Origin on cross-site POSTs. */
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return true; // non-browser clients (curl, desktop app); CSRF needs a browser, which sends Origin
  try { return new URL(origin).host === req.headers.get("host"); } catch { return false; }
}
export const csrfFail = () => fail(403, "Cross-site request blocked.");

export async function readJson(req: Request, maxBytes = 50_000): Promise<Record<string, unknown> | null> {
  const len = Number(req.headers.get("content-length") || 0);
  if (len > maxBytes) return null;
  try {
    const raw = await req.text();
    if (raw.length > maxBytes) return null;
    const v = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch { return null; }
}

/** Authenticates an API request from its session cookie. Returns the user, or a ready-made 401 response. */
export function requireUser(req: Request): { user: SessionUser; token: string } | { res: NextResponse } {
  const token = tokenFromRequest(req);
  const user = getUserByToken(token);
  if (!user || !token) return { res: fail(401, "Please log in to continue.") };
  return { user, token };
}
