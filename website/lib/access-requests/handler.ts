import "server-only";
import { NextResponse } from "next/server";
import { AuthRequestError, readAuthRequest } from "../auth/request";
import { setPrivateNoStore } from "../supabase/cache";
import { getSupabaseConfiguration } from "../supabase/config";
import { normalizeAccessRequest } from "../../../supabase/functions/submit-access-request/core.mjs";
import { takeSiteRateLimit } from "../site-persistence/client";
import { clientIp } from "../network/client-ip";

const unavailable = "Request submission is temporarily unavailable. Please try again.";

function response(status: number, error?: string, fields?: Record<string, string>, retryAfter?: number) {
  const result = NextResponse.json(error ? { ok: false, error, ...(fields ? { fields } : {}) } : { ok: true }, { status });
  setPrivateNoStore(result.headers);
  if (retryAfter) result.headers.set("Retry-After", String(retryAfter));
  return result;
}

export async function requestPortalAccess(request: Request) {
  const started = Date.now();
  try {
    const body = await readAuthRequest(request);
    const limit = await takeSiteRateLimit(`access-request:${clientIp(request)}`, 5, 600);
    if (!limit.ok) return response(429, "Too many requests. Please try again later.", undefined, limit.retryAfter);
    let input;
    try { input = normalizeAccessRequest(body); }
    catch { throw new AuthRequestError(400, "Invalid request."); }
    if (!input.value) return response(400, "Please fix the highlighted fields.", { ...input.fields });
    if (!input.honeypot) {
      const configuration = getSupabaseConfiguration();
      const secret = process.env.ACCESS_REQUEST_SUBMISSION_SECRET;
      if (!/^[A-Za-z0-9_-]{43,128}$/.test(secret ?? "")) throw new Error();
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
