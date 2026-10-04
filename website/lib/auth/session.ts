import { createHash, randomBytes, randomUUID } from "crypto";
import { db } from "../db";
import { COOKIE_NAME, SESSION_DAYS, SESSION_DAYS_REMEMBER } from "./constants";

/**
 * Opaque server-side sessions: the browser holds a random 256-bit token in an httpOnly cookie; the
 * database stores only its SHA-256 hash. A leaked database can't be used to impersonate anyone, there
 * is no signing secret to leak, and logout/revocation is instant (delete the row).
 */
export type SessionUser = { id: string; email: string; name: string };

const sha = (t: string) => createHash("sha256").update(t).digest("hex");
const DAY = 86_400_000;

export function createSession(userId: string, opts: { ip?: string; ua?: string; remember?: boolean }) {
  const token = randomBytes(32).toString("base64url");
  const days = opts.remember ? SESSION_DAYS_REMEMBER : SESSION_DAYS;
  const now = new Date(), expires = new Date(now.getTime() + days * DAY);
  const d = db();
  d.prepare("DELETE FROM sessions WHERE expires_at < ?").run(now.toISOString()); // opportunistic cleanup
  d.prepare("INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, last_used_at, ip, user_agent) VALUES (?,?,?,?,?,?,?,?)")
    .run(randomUUID(), userId, sha(token), now.toISOString(), expires.toISOString(), now.toISOString(), opts.ip ?? null, (opts.ua ?? "").slice(0, 200));
  return { token, maxAge: days * 86400 };
}

export function getUserByToken(token: string | undefined | null): SessionUser | null {
  if (!token || token.length < 20 || token.length > 100) return null;
  const now = new Date().toISOString();
  const row = db().prepare(
    "SELECT s.id AS sid, s.last_used_at, u.id, u.email, u.name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?",
  ).get(sha(token), now);
  if (!row) return null;
  if (Date.parse(row.last_used_at) < Date.now() - 5 * 60_000) db().prepare("UPDATE sessions SET last_used_at=? WHERE id=?").run(now, row.sid);
  return { id: row.id, email: row.email, name: row.name };
}

export const destroySession = (token: string) => void db().prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha(token));
export const destroyOtherSessions = (userId: string, keepToken: string) =>
  void db().prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?").run(userId, sha(keepToken));
export const destroyAllSessions = (userId: string) => void db().prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);

export const cookieOptions = (maxAge: number) => ({ httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge });

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header || "").split(";")) { const i = part.indexOf("="); if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); }
  return out;
}
export const tokenFromRequest = (req: Request) => parseCookies(req.headers.get("cookie"))[COOKIE_NAME];
