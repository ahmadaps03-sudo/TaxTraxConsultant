import "server-only";
import { createHmac } from "node:crypto";
import { getSupabaseConfiguration } from "../supabase/config";

export type SiteCollection = "messages" | "bookings" | "leads" | "posts" | "videos";
export type SiteRow = Record<string, unknown> & { id: string; createdAt: string };
export type SitePageView = {
  ts: string;
  day: string;
  path: string;
  country: string;
  visitor: string;
  referrer: string | null;
  device: "desktop" | "mobile" | "tablet";
};

export class SitePersistenceUnavailable extends Error {
  constructor() { super("Site persistence is temporarily unavailable."); }
}

type Scope = "ingest" | "admin";
const secretName = { ingest: "SITE_INGEST_SECRET", admin: "SITE_ADMIN_DATA_SECRET" } as const;

function scopedSecret(scope: Scope) {
  const secret = process.env[secretName[scope]];
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(secret ?? "") || secret === process.env[secretName[scope === "ingest" ? "admin" : "ingest"]]) {
    throw new SitePersistenceUnavailable();
  }
  return secret as string;
}

async function call<T>(scope: Scope, body: Record<string, unknown>): Promise<T> {
  try {
    const { url, key } = getSupabaseConfiguration();
    const response = await fetch(`${url}/functions/v1/site-persistence`, {
      method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10_000),
      headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${scopedSecret(scope)}` },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error();
    const result = await response.json();
    if (result?.ok !== true) throw new Error();
    return result.data as T;
  } catch { throw new SitePersistenceUnavailable(); }
}

export async function takeSiteRateLimit(key: string, max: number, windowSeconds: number) {
  if (!key || key.length > 256 || !Number.isInteger(max) || max < 1 || max > 10000
    || !Number.isInteger(windowSeconds) || windowSeconds < 1 || windowSeconds > 86400) throw new SitePersistenceUnavailable();
  const hash = createHmac("sha256", scopedSecret("ingest")).update(key).digest("hex");
  const result = await call<{ ok: boolean; retryAfter: number }>("ingest", { action: "rate_limit", hash, max, windowSeconds });
  if (typeof result?.ok !== "boolean" || !Number.isInteger(result.retryAfter) || result.retryAfter < 0 || result.retryAfter > windowSeconds) throw new SitePersistenceUnavailable();
  return result;
}

export const addSiteSubmission = (collection: "messages" | "bookings" | "leads", data: Record<string, unknown>) =>
  call<SiteRow>("ingest", { action: "record_add", collection, data });

export const addSiteContent = (collection: "posts" | "videos", data: Record<string, unknown>) =>
  call<SiteRow>("admin", { action: "record_add", collection, data });

export const listSiteRecordsForAdmin = (collection: SiteCollection) =>
  call<SiteRow[]>("admin", { action: "record_list", collection });

export const writeSitePageView = (view: SitePageView) =>
  call<void>("ingest", { action: "page_view", view });
