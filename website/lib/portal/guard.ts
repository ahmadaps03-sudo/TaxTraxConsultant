import "server-only";
import { NextResponse } from "next/server";
import { createRequestSupabaseClient } from "../supabase/client";
import { authorizePortalClient, type ClientIdentity } from "../auth/authorize";
import { setPrivateNoStore } from "../supabase/cache";
import { PortalError, type Db } from "./service";
import { boundedJson, PortalBodyError } from "./body";
import { portalMutationBoundary } from "./origin";

/**
 * Guard for /api/client/* (the signed-in client's own data).
 *  - Identity comes from the existing Supabase session cookie, checked with the SAME authorizePortalClient()
 *    used by /portal, so suspended / pending / unconfirmed accounts are refused here too.
 *  - State-changing requests must be same-origin and carry the X-TaxTrax-Auth header (a custom header can't be
 *    sent cross-site without a CORS preflight, which we never grant).
 *  - Data access uses ctx.db: the client's OWN Supabase session, so Postgres RLS applies. No service-role key anywhere.
 *  - If Supabase had to refresh the session while checking it, the new cookies are written onto the response.
 */
export type ClientContext = { user: ClientIdentity; db: Db; json: (data: unknown, status?: number) => NextResponse; fail: (status: number, error: string, fields?: Record<string, string>) => NextResponse; binary: (res: Response) => Response };

export async function withClient(request: Request, mutating: boolean, handler: (ctx: ClientContext) => Promise<Response> | Response): Promise<Response> {
  let requestClient: ReturnType<typeof createRequestSupabaseClient> | undefined;
  const finish = (response: NextResponse | Response) => {
    const res = response instanceof NextResponse ? response : new NextResponse(response.body, { status: response.status, headers: response.headers });
    setPrivateNoStore(res.headers);
    if (requestClient) for (const { name, value, options } of requestClient.state.pendingWrites()) res.cookies.set(name, value, options);
    return res;
  };
  const fail = (status: number, error: string, fields?: Record<string, string>) => finish(NextResponse.json({ ok: false, error, fields }, { status })) as NextResponse;
  try {
    if (mutating) {
      const boundary = portalMutationBoundary(request, process.env.AUTH_ORIGIN);
      if (boundary === "unavailable") return fail(503, "The portal is temporarily unavailable.");
      if (boundary === "denied") return fail(403, "Request not allowed.");
    }
    requestClient = createRequestSupabaseClient(request.headers.get("cookie"), () => {});
    const auth = await authorizePortalClient(requestClient);
    if (auth.status === "ineligible") return fail(401, "Please log in to continue.");
    if (auth.status === "unavailable") return fail(503, "The portal is temporarily unavailable. Please reload and try again.");
    const ctx: ClientContext = {
      user: auth.user, db: requestClient.client,
      json: (data, status = 200) => finish(NextResponse.json({ ok: true, data }, { status })) as NextResponse,
      fail,
      binary: (res) => finish(res),
    };
    return await handler(ctx);
  } catch (e) {
    if (e instanceof PortalError) return fail(e.status, e.message, (e as PortalError & { fields?: Record<string, string> }).fields);
    if (e instanceof PortalBodyError) return fail(e.status, e.status === 413 ? "Request too large." : "Invalid request.");
    console.error("[portal-api] request_failed");
    return fail(500, "Something went wrong. Please try again.");
  }
}

/** Reads a small JSON body (profile, payments, sign...). */
export async function jsonBody(request: Request, max = 20_000): Promise<Record<string, unknown>> {
  return boundedJson(request, max);
}
