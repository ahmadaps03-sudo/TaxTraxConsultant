import { db } from "../db";

/** Fixed-window limiter stored in the database, so limits survive restarts and are shared by all workers. */
export function rateLimit(key: string, max: number, windowSec: number) {
  const now = Math.floor(Date.now() / 1000), d = db();
  const row = d.prepare("SELECT window_start, count FROM rate_limits WHERE key=?").get(key);
  if (!row || now - row.window_start >= windowSec) {
    d.prepare("INSERT INTO rate_limits (key, window_start, count) VALUES (?,?,1) ON CONFLICT(key) DO UPDATE SET window_start=excluded.window_start, count=1").run(key, now);
    return { ok: true, retryAfter: 0 };
  }
  d.prepare("UPDATE rate_limits SET count = count + 1 WHERE key=?").run(key);
  return { ok: row.count + 1 <= max, retryAfter: Math.max(1, windowSec - (now - row.window_start)) };
}
export const resetRateLimit = (key: string) => void db().prepare("DELETE FROM rate_limits WHERE key=?").run(key);
