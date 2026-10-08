import "server-only";
import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { NextResponse } from "next/server";
import { AuthRequestError, readAuthRequest } from "../auth/request";
import { setPrivateNoStore } from "../supabase/cache";
import { getSupabaseConfiguration } from "../supabase/config";
import { normalizeAccessRequest } from "../../../supabase/functions/submit-access-request/core.mjs";

const buckets = new Map<string, { count: number; expires: number }>();
const unavailable = "Request submission is temporarily unavailable. Please try again.";

function response(status: number, error?: string, fields?: Record<string, string>, retryAfter?: number) {
  const result = NextResponse.json(error ? { ok: false, error, ...(fields ? { fields } : {}) } : { ok: true }, { status });
  setPrivateNoStore(result.headers);
  if (retryAfter) result.headers.set("Retry-After", String(retryAfter));
  return result;
}

function limit(request: Request) {
  const now = Date.now();
  for (const [key, bucket] of buckets) if (bucket.expires <= now) buckets.delete(key);
  const candidate = process.env.TRUST_PROXY === "1" ? request.headers.get("x-forwarded-for")?.split(",")[0].trim() : undefined;
  const address = candidate && isIP(candidate) ? candidate : "untrusted-local";
  const key = createHash("sha256").update(address).digest("hex");
  const bucket = buckets.get(key);
  if (!bucket && buckets.size >= 10000) return 600;
  const current = bucket ?? { count: 0, expires: now + 600000 };
  buckets.set(key, current);
  current.count++;
  return current.count > 5 ? Math.max(1, Math.ceil((current.expires - now) / 1000)) : 0;
}

export async function requestPortalAccess(request: Request) {
  const started = Date.now();
  try {
    const body = await readAuthRequest(request);
    const retryAfter = limit(request);
    if (retryAfter) return response(429, "Too many requests. Please try again later.", undefined, retryAfter);
    let input;
    try { input = normalizeAccessRequest(body); }
    catch { throw new AuthRequestError(400, "Invalid request."); }
    if (!input.value) return response(400, "Please fix the highlighted fields.", { ...input.fields });
    if (!input.honeypot) {
      const configuration = getSupabaseConfiguration();
      const secret = process.env.ACCESS_REQUEST_SUBMISSION_SECRET;
      if (configuration.url !== "https://dbcakdqthnamgjfkkxzn.supabase.co" || !/^[A-Za-z0-9_-]{43,128}$/.test(secret ?? "")) throw new Error();
      const result = await fetch(`${configuration.url}/functions/v1/submit-access-request`, {
        method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10000),
        headers: { "Content-Type": "application/json", apikey: configuration.key, Authorization: `Bearer ${secret}` },
        body: JSON.stringify({ ...input.value, company: input.value.company ?? "", website: "" }),
      });
      if (!result.ok || (await result.json()).ok !== true) throw new Error();
    }
    await new Promise(resolve => setTimeout(resolve, Math.max(0, 350 - (Date.now() - started))));
    return response(200);
  } catch (error) {
    return error instanceof AuthRequestError && error.status !== 503
      ? response(error.status, error.message) : response(503, unavailable);
  }
}
