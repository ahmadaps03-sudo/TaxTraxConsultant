import { createHash } from "crypto";
import { db } from "./db";
import { list } from "./store";

/**
 * Privacy-friendly analytics: stores country, page, referrer host and a daily-rotating anonymous visitor hash.
 * Raw IP addresses are never saved. Country comes from CDN headers (Cloudflare, Vercel, CloudFront, nginx geoip)
 * or, if available, the bundled `geoip-lite` database; otherwise it is recorded as "ZZ" (unknown).
 */
const BOT = /bot|crawl|spider|slurp|preview|headless|lighthouse|monitor|curl|wget|python-requests|facebookexternalhit/i;
const COUNTRY_HEADERS = ["cf-ipcountry", "x-vercel-ip-country", "cloudfront-viewer-country", "x-country-code", "x-geo-country"];

export function ipFromRequest(req: Request) {
  const x = req.headers.get("x-forwarded-for");
  return (x ? x.split(",")[0].trim() : req.headers.get("x-real-ip")) || "";
}

export function countryFromRequest(req: Request): string {
  for (const h of COUNTRY_HEADERS) {
    const v = (req.headers.get(h) || "").trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(v) && !["XX", "T1"].includes(v)) return v;
  }
  const ip = ipFromRequest(req).replace(/^::ffff:/, "");
  if (ip) {
    try {
      const geo = (eval("require") as NodeRequire)("geoip-lite");
      const c = geo.lookup(ip)?.country;
      if (c) return String(c).toUpperCase();
    } catch { /* geoip-lite not installed */ }
  }
  return "ZZ";
}

const device = (ua: string) => (/ipad|tablet/i.test(ua) ? "tablet" : /mobi|android|iphone/i.test(ua) ? "mobile" : "desktop");

export function recordView(req: Request, input: { path: unknown; ref?: unknown }): boolean {
  const ua = req.headers.get("user-agent") || "";
  if (!ua || BOT.test(ua)) return false;
  let p = typeof input.path === "string" ? input.path.split(/[?#]/)[0].slice(0, 200) : "";
  if (!p.startsWith("/") || /^\/(api|portal|_next)\b/.test(p)) return false;
  if (p.length > 1) p = p.replace(/\/+$/, "");
  let ref = "";
  try { if (typeof input.ref === "string" && input.ref) { const u = new URL(input.ref); if (u.host !== req.headers.get("host")) ref = u.hostname.replace(/^www\./, "").slice(0, 80); } } catch { /* ignore */ }
  const now = new Date(), day = now.toISOString().slice(0, 10);
  const visitor = createHash("sha256").update(`${day}|${ipFromRequest(req)}|${ua}|${process.env.ANALYTICS_SALT || "taxtrax"}`).digest("hex").slice(0, 16);
  db().prepare("INSERT INTO page_views (ts, day, path, country, visitor, referrer, device) VALUES (?,?,?,?,?,?,?)")
    .run(now.toISOString(), day, p, countryFromRequest(req), visitor, ref || null, device(ua));
  return true;
}

const lastDays = (n: number) => Array.from({ length: n }, (_, i) => new Date(Date.now() - (n - 1 - i) * 86_400_000).toISOString().slice(0, 10));

/** Everything the admin dashboard charts need, for the last `days` days. */
export async function getAnalytics(days = 30) {
  const d = db(), since = lastDays(days)[0];
  const one = (sql: string, ...a: unknown[]) => d.prepare(sql).get(...a);
  const all = (sql: string, ...a: unknown[]) => d.prepare(sql).all(...a);
  const totals = one("SELECT COUNT(*) AS views, COUNT(DISTINCT day || visitor) AS visitors FROM page_views WHERE day >= ?", since);
  const byDayRows = all("SELECT day, COUNT(*) AS views, COUNT(DISTINCT visitor) AS visitors FROM page_views WHERE day >= ? GROUP BY day", since);
  const m = new Map(byDayRows.map((r: { day: string }) => [r.day, r]));
  const [bookings, messages, leads] = await Promise.all([list("bookings"), list("messages"), list("leads")]);
  type R = Record<string, unknown>;
  const inRange = (rows: R[]) => rows.filter((r) => String(r.createdAt).slice(0, 10) >= since);
  const count = (rows: R[]) => { const c: Record<string, number> = {}; for (const r of inRange(rows)) { const k = String(r.createdAt).slice(0, 10); c[k] = (c[k] || 0) + 1; } return c; };
  const bc = count(bookings), mc = count(messages), lc = count(leads);
  const svc: Record<string, number> = {};
  for (const b of inRange(bookings)) { const k = String(b.service || "General consultation"); svc[k] = (svc[k] || 0) + 1; }
  const visitors = Number(totals.visitors);
  return {
    days, totals: { views: Number(totals.views), visitors, bookings: inRange(bookings).length, messages: inRange(messages).length, leads: inRange(leads).length,
      conversion: visitors ? inRange(bookings).length / visitors : 0 },
    byDay: lastDays(days).map((day) => ({ day, views: Number((m.get(day) as { views?: number })?.views ?? 0), visitors: Number((m.get(day) as { visitors?: number })?.visitors ?? 0), bookings: bc[day] || 0, messages: mc[day] || 0, leads: lc[day] || 0 })),
    countries: all("SELECT country, COUNT(*) AS views, COUNT(DISTINCT day || visitor) AS visitors FROM page_views WHERE day >= ? GROUP BY country ORDER BY visitors DESC, views DESC LIMIT 10", since),
    pages: all("SELECT path, COUNT(*) AS views FROM page_views WHERE day >= ? GROUP BY path ORDER BY views DESC LIMIT 8", since),
    referrers: all("SELECT referrer, COUNT(*) AS views FROM page_views WHERE day >= ? AND referrer IS NOT NULL GROUP BY referrer ORDER BY views DESC LIMIT 6", since),
    devices: all("SELECT device, COUNT(DISTINCT day || visitor) AS visitors FROM page_views WHERE day >= ? GROUP BY device ORDER BY visitors DESC", since),
    bookingsByService: Object.entries(svc).map(([service, n]) => ({ service, bookings: n })).sort((a, b) => b.bookings - a.bookings).slice(0, 8),
  };
}
