import "server-only";
import { NextResponse } from "next/server";
import { createRequestSupabaseClient } from "../supabase/client";
import { createAuthCookieState, secureCookieOptions, type AuthCookieState, type AuthCookieWrite } from "../supabase/cookies";
import { getSupabaseConfiguration, SupabaseConfigurationError } from "../supabase/config";
import { setPrivateNoStore } from "../supabase/cache";
import { authorizePortalClient } from "./authorize";
import { AuthRequestError, loginCredentials, readAuthRequest } from "./request";

const denied = "Unable to sign in.";
const unavailable = "Authentication is temporarily unavailable. Please try again.";

function response(status: number, error?: string, writes: AuthCookieWrite[] = []) {
  const result = NextResponse.json(error ? { ok: false, error } : { ok: true }, { status });
  setPrivateNoStore(result.headers);
  for (const { name, value, options } of writes) result.cookies.set(name, value, options);
  return result;
}

function deletions(cookieName: string, ...states: AuthCookieState[]): AuthCookieWrite[] {
  const names = new Set([cookieName]);
  for (const state of states) {
    state.clear();
    for (const write of state.pendingWrites()) names.add(write.name);
  }
  return [...names].map(name => ({ name, value: "", options: secureCookieOptions({ maxAge: 0, expires: new Date(0) }) }));
}

async function revokeSession(header: string) {
  let providerStatus: number | undefined;
  let sessionMissing = false;
  try {
    const request = createRequestSupabaseClient(header, () => {}, process.env, (status, missing) => { providerStatus = status; sessionMissing = missing; });
    const result = await request.client.auth.signOut({ scope: "local" });
    return sessionMissing || (!result.error && providerStatus !== undefined && providerStatus >= 200 && providerStatus < 300);
  } catch {
    return false;
  }
}

export function rejectAuthMethod() {
  const result = response(405, "Method not allowed.");
  result.headers.set("Allow", "POST");
  return result;
}

export async function login(request: Request) {
  let staged: ReturnType<typeof createRequestSupabaseClient> | undefined;
  let incoming: AuthCookieState | undefined;
  let cookieName: string | undefined;
  let established: string | undefined;
  try {
    const credentials = loginCredentials(await readAuthRequest(request));
    cookieName = getSupabaseConfiguration().cookieName;
    incoming = createAuthCookieState(request.headers.get("cookie"), cookieName);
    staged = createRequestSupabaseClient(null, () => {});
    const signed = await staged.client.auth.signInWithPassword(credentials);
    if (signed.error) {
      const status = signed.error.status;
      const rejected = ["invalid_credentials", "email_not_confirmed", "user_banned"].includes(signed.error.code ?? "");
      return response(status === 429 ? 429 : rejected ? 401 : 503, status === 429 ? "Too many sign-in attempts. Please try again later." : rejected ? denied : unavailable, deletions(cookieName, incoming, staged.state));
    }
    established = staged.state.forwardedHeader();
    const eligible = await authorizePortalClient(staged);
    if (eligible.status !== "authorized") {
      const revoked = await revokeSession(established);
      established = undefined;
      return response(eligible.status === "ineligible" && revoked ? 401 : 503, eligible.status === "ineligible" && revoked ? denied : unavailable, deletions(cookieName, incoming, staged.state));
    }
    const replacement = new Map(deletions(cookieName, incoming).map(write => [write.name, write]));
    for (const write of staged.state.pendingWrites()) replacement.set(write.name, write);
    return response(200, undefined, [...replacement.values()]);
  } catch (error) {
    if (established) await revokeSession(established);
    const status = error instanceof AuthRequestError ? error.status : staged ? 500 : 503;
    const message = error instanceof AuthRequestError ? error.message : staged ? "Unable to complete authentication." : unavailable;
    return response(status, message, cookieName && incoming ? deletions(cookieName, incoming, ...(staged ? [staged.state] : [])) : []);
  }
}

export async function logout(request: Request) {
  let scoped: ReturnType<typeof createRequestSupabaseClient> | undefined;
  let cookieName: string | undefined;
  try {
    const body = await readAuthRequest(request);
    if (Object.keys(body).length) throw new AuthRequestError(400, "Invalid request.");
    cookieName = getSupabaseConfiguration().cookieName;
    let providerStatus: number | undefined;
    let sessionMissing = false;
    scoped = createRequestSupabaseClient(request.headers.get("cookie"), () => {}, process.env, (status, missing) => { providerStatus = status; sessionMissing = missing; });
    if (scoped.state.malformed) return response(400, "Invalid request.", deletions(cookieName, scoped.state));
    const absent = scoped.state.getAll().length === 0;
    const result = await scoped.client.auth.signOut({ scope: "local" });
    const confirmed = sessionMissing || (!result.error && (absent || (providerStatus !== undefined && providerStatus >= 200 && providerStatus < 300)));
    return response(confirmed ? 200 : 503, confirmed ? undefined : "Unable to confirm sign-out. Please try again.", deletions(cookieName, scoped.state));
  } catch (error) {
    return response(error instanceof AuthRequestError ? error.status : 503, error instanceof AuthRequestError ? error.message : error instanceof SupabaseConfigurationError ? unavailable : "Unable to confirm sign-out. Please try again.", cookieName && scoped ? deletions(cookieName, scoped.state) : []);
  }
}
