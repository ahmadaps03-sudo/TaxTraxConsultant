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

export async function listPublishedSiteContent(collection: "posts" | "videos"): Promise<SiteRow[]> {
  try {
    const { url, key } = getSupabaseConfiguration();
    const rows: SiteRow[] = [];
    for (let offset = 0; ; offset += 1000) {
      const query = new URLSearchParams({ collection: `eq.${collection}`, select: "id,created_at,data", order: "created_at.desc,id.desc", limit: "1000", offset: String(offset) });
      const response = await fetch(`${url}/rest/v1/site_records?${query}`, {
        headers: { apikey: key }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error();
      const page: unknown = await response.json();
      if (!Array.isArray(page)) throw new Error();
      for (const row of page) {
        if (!row || typeof row !== "object" || row.data?.published !== true || typeof row.id !== "string" || typeof row.created_at !== "string") throw new Error();
        rows.push({ ...row.data, id: row.id, createdAt: new Date(row.created_at).toISOString() });
      }
      if (page.length < 1000) return rows;
    }
  } catch { throw new SitePersistenceUnavailable(); }
}

export const updateSiteRecordForAdmin = (collection: SiteCollection, id: string, patch: Record<string, unknown>) =>
  call<SiteRow | null>("admin", { action: "record_update", collection, id, patch });

export const deleteSiteRecordForAdmin = (collection: SiteCollection, id: string) =>
  call<SiteRow | null>("admin", { action: "record_delete", collection, id });

export const writeSitePageView = (view: SitePageView) =>
  call<void>("ingest", { action: "page_view", view });

export const signSiteVideoUpload = (size: number, contentType: string) =>
  call<{ file: string; uploadUrl: string }>("admin", { action: "video_upload_sign", size, contentType });

export const cleanupSiteVideoUpload = (file: string) =>
  call<void>("admin", { action: "video_upload_cleanup", file });

export const signSiteVideoPlayback = (file: string) =>
  call<{ url: string }>("ingest", { action: "video_playback_sign", file });
