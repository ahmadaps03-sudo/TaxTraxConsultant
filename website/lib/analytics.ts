import { createHmac } from "node:crypto";
import { clientIp } from "./network/client-ip";
import { list } from "./store";
import { readSiteAnalytics, writeSitePageView } from "./site-persistence/client";

const BOT = /bot|crawl|spider|slurp|preview|headless|lighthouse|monitor|curl|wget|python-requests|facebookexternalhit/i;
const COUNTRY_HEADERS = ["cf-ipcountry", "x-vercel-ip-country", "cloudfront-viewer-country", "x-country-code", "x-geo-country"];

export function countryFromRequest(req: Request): string {
  if (process.env.TRUST_PROXY === "1") {
    for (const header of COUNTRY_HEADERS) {
      const country = (req.headers.get(header) || "").trim().toUpperCase();
      if (/^[A-Z]{2}$/.test(country) && !["XX", "T1"].includes(country)) return country;
    }
    const address = clientIp(req).replace(/^::ffff:/, "");
    if (address !== "unknown") {
      try {
        const geo = (eval("require") as NodeRequire)("geoip-lite");
        const country = geo.lookup(address)?.country;
        if (typeof country === "string" && /^[A-Z]{2}$/.test(country)) return country;
      } catch { /* country is optional */ }
    }
  }
  return "ZZ";
}

const device = (ua: string) => (/ipad|tablet/i.test(ua) ? "tablet" : /mobi|android|iphone/i.test(ua) ? "mobile" : "desktop");

export async function recordView(req: Request, input: { path: unknown; ref?: unknown }): Promise<boolean> {
  const ua = req.headers.get("user-agent") || "";
  if (!ua || BOT.test(ua)) return false;
  let path = typeof input.path === "string" ? input.path.split(/[?#]/)[0].slice(0, 200) : "";
  if (!path.startsWith("/") || /^\/(api|portal|_next)\b/.test(path)) return false;
  if (path.length > 1) path = path.replace(/\/+$/, "");
  let referrer = "";
  try { if (typeof input.ref === "string" && input.ref) { const url = new URL(input.ref); if (url.host !== req.headers.get("host")) referrer = url.hostname.replace(/^www\./, "").slice(0, 80); } } catch { /* ignore */ }
  const secret = process.env.ANALYTICS_SALT || process.env.SITE_INGEST_SECRET;
  if (!secret || secret.length < 32) throw new Error("Analytics unavailable.");
  const now = new Date(), day = now.toISOString().slice(0, 10);
  const visitor = createHmac("sha256", secret).update(`${day}|${clientIp(req)}|${ua}`).digest("hex").slice(0, 16);
  await writeSitePageView({ ts: now.toISOString(), day, path, country: countryFromRequest(req), visitor, referrer: referrer || null, device: device(ua) });
  return true;
}

const lastDays = (days: number) => Array.from({ length: days }, (_, index) => new Date(Date.now() - (days - 1 - index) * 86_400_000).toISOString().slice(0, 10));

export async function getAnalytics(days = 30) {
  const dates = lastDays(days), since = dates[0];
  const [views, bookings, messages, leads] = await Promise.all([readSiteAnalytics(days), list("bookings"), list("messages"), list("leads")]);
  type Row = Record<string, unknown>;
  const inRange = (rows: Row[]) => rows.filter(row => String(row.createdAt).slice(0, 10) >= since);
  const count = (rows: Row[]) => { const result: Record<string, number> = {}; for (const row of inRange(rows)) { const day = String(row.createdAt).slice(0, 10); result[day] = (result[day] || 0) + 1; } return result; };
  const bookingsByDay = count(bookings), messagesByDay = count(messages), leadsByDay = count(leads);
  const services: Record<string, number> = {};
  for (const booking of inRange(bookings)) { const service = String(booking.service || "General consultation"); services[service] = (services[service] || 0) + 1; }
  const pageViews = new Map(views.byDay.map(row => [row.day, row]));
  return {
    days, totals: { views: views.views, visitors: views.visitors, bookings: inRange(bookings).length, messages: inRange(messages).length, leads: inRange(leads).length,
      conversion: views.visitors ? inRange(bookings).length / views.visitors : 0 },
    byDay: dates.map(day => ({ day, views: pageViews.get(day)?.views ?? 0, visitors: pageViews.get(day)?.visitors ?? 0,
      bookings: bookingsByDay[day] || 0, messages: messagesByDay[day] || 0, leads: leadsByDay[day] || 0 })),
    countries: views.countries, pages: views.pages, referrers: views.referrers, devices: views.devices,
    bookingsByService: Object.entries(services).map(([service, count]) => ({ service, bookings: count })).sort((left, right) => right.bookings - left.bookings).slice(0, 8),
  };
}
