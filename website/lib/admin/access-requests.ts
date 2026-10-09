import "server-only";
import { NextResponse } from "next/server";
import { requireAdmin } from "../api";
import { setPrivateNoStore } from "../supabase/cache";
import { getSupabaseConfiguration } from "../supabase/config";
import { reviewData, reviewInput } from "../../../supabase/functions/review-access-requests/core.mjs";

class RequestError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function response(status: number, body: unknown) {
  const result = NextResponse.json(body, { status });
  setPrivateNoStore(result.headers);
  result.headers.set("Referrer-Policy", "no-referrer");
  return result;
}

function validatedInput(body: unknown) {
  try { return reviewInput(body); } catch { throw new RequestError(400, "Invalid request."); }
}

async function patchBody(request: Request) {
  if (!/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(request.headers.get("content-type") ?? "")) throw new RequestError(415, "JSON required.");
  const length = request.headers.get("content-length");
  if (length !== null && !/^\d+$/.test(length)) throw new RequestError(400, "Invalid request.");
  if (Number(length ?? 0) > 4096) throw new RequestError(413, "Request too large.");
  if (!request.body) throw new RequestError(400, "Invalid request.");
  const reader = request.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const chunks: Uint8Array[] = []; let size = 0;
        while (true) {
          const part = await reader.read(); if (part.done) break;
          size += part.value.byteLength;
          if (size > 4096) throw new RequestError(413, "Request too large.");
          chunks.push(part.value);
        }
        const buffer = new Uint8Array(size); let offset = 0;
        for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
        return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer));
      })(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new RequestError(408, "Request timed out.")), 5000); }),
    ]);
  } catch (error) { throw error instanceof RequestError ? error : new RequestError(400, "Invalid request."); }
  finally { clearTimeout(timer); void reader.cancel().catch(() => {}); reader.releaseLock(); }
}

async function reviewRequest(request: Request, accounts: boolean) {
  const denied = requireAdmin(request);
  if (denied) return response(denied.status, { ok: false, error: denied.status === 401 ? "Unauthorized" : "Admin review unavailable." });
  try {
    const origin = request.headers.get("origin");
    if (origin !== null && origin !== process.env.AUTH_ORIGIN) throw new RequestError(403, "Request not allowed.");
    const site = request.headers.get("sec-fetch-site");
    const mode = request.headers.get("sec-fetch-mode");
    const destination = request.headers.get("sec-fetch-dest");
    if ((site !== null && !["same-origin", "none"].includes(site)) || (mode !== null && !["cors", "same-origin"].includes(mode)) || (destination !== null && destination !== "empty")) throw new RequestError(403, "Request not allowed.");
    const url = new URL(request.url);
    if (request.url.length > 2048) throw new RequestError(400, "Invalid request.");
    let input;
    if (request.method === "GET") {
      if (!url.searchParams.size) input = validatedInput({ action: accounts ? "list_all" : "list" });
      else if (!accounts && url.searchParams.size === 1 && url.searchParams.has("id")) input = validatedInput({ action: "detail", id: url.searchParams.get("id") });
      else throw new RequestError(400, "Invalid request.");
    } else if (request.method === "PATCH") {
      if (url.searchParams.size) throw new RequestError(400, "Invalid request.");
      const body = await patchBody(request);
      if (accounts) {
        if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 2
          || !Object.hasOwn(body, "id") || !Object.hasOwn(body, "status")
          || !["approved", "rejected", "suspended"].includes((body as { status?: unknown }).status as string)) throw new RequestError(400, "Invalid request.");
        const status = (body as { status: string }).status;
        input = validatedInput({ id: (body as { id: unknown }).id, action: status === "approved" ? "set_approved" : status === "rejected" ? "reject_pending" : "suspend" });
      } else {
        input = validatedInput(body);
        if (!["approve", "reject", "resend_invite"].includes(input.action)) throw new RequestError(400, "Invalid request.");
      }
    } else throw new RequestError(405, "Method not allowed.");
    const configuration = getSupabaseConfiguration();
    const secret = process.env.ADMIN_ACCESS_REQUEST_SECRET;
    if (configuration.url !== "https://dbcakdqthnamgjfkkxzn.supabase.co" || !/^[A-Za-z0-9_-]{43,128}$/.test(secret ?? "")
      || secret === process.env.ACCESS_REQUEST_SUBMISSION_SECRET) throw new Error();
    const result = await fetch(`${configuration.url}/functions/v1/review-access-requests`, {
      method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(45000),
      headers: { "Content-Type": "application/json", apikey: configuration.key, Authorization: `Bearer ${secret}` }, body: JSON.stringify(input),
    });
    const body = await result.json();
    if (![200, 404, 409, 503].includes(result.status) || body.ok !== (result.status === 200)) throw new Error();
    const data = body.data === undefined ? undefined : reviewData(body.data);
    if (result.status === 200 && data === undefined) throw new Error();
    const error = result.status === 404 ? "Request not found." : result.status === 409
      ? "Request cannot perform this action now. Refresh its details before retrying." : "Admin review unavailable. Refresh request details before retrying.";
    const accountData = accounts && data !== undefined ? (Array.isArray(data) ? data : [data]).map(row => {
      if (typeof row.name !== "string" || typeof row.email !== "string" || typeof row.phone !== "string"
        || (row.company !== null && typeof row.company !== "string")
        || !["pending", "approved", "rejected", "suspended"].includes(row.status)
        || typeof row.created_at !== "string" || (row.decided_at !== null && typeof row.decided_at !== "string")) throw new Error();
      return { id: row.id, name: row.name, email: row.email, phone: row.phone, company: row.company,
        status: row.status, createdAt: row.created_at, decidedAt: row.decided_at };
    }) : undefined;
    return response(result.status, { ok: body.ok, ...(data === undefined ? {} : { data: accounts ? (request.method === "GET" ? accountData : accountData?.[0]) : data }), ...(body.ok ? {} : { error }) });
  } catch (error) {
    const status = error instanceof RequestError ? error.status : 503;
    return response(status, { ok: false, error: error instanceof RequestError ? error.message : "Admin review unavailable. Refresh request details before retrying." });
  }
}

export const reviewAdminAccessRequest = (request: Request) => reviewRequest(request, false);
export const reviewAdminAccount = (request: Request) => reviewRequest(request, true);
