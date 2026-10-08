import "server-only";
import { NextResponse } from "next/server";
import { authorizePortalClient, isInvalidProviderIdentity, type PortalAuthorization } from "./authorize";
import { AuthRequestError, readAuthRequest } from "./request";
import { createRequestSupabaseClient, type RequestSupabaseClient } from "../supabase/client";
import { createAuthCookieState, secureCookieOptions } from "../supabase/cookies";
import { getSupabaseConfiguration } from "../supabase/config";
import { setPrivateNoStore } from "../supabase/cache";
import { checkPassword } from "../validation";

const linkCookie = "taxtrax-activation-link";
const invalidLink = "This invitation is invalid or has expired. Contact the TaxTrax team.";
const unavailable = "Account setup is temporarily unavailable. Please try again.";

function origin() {
  const configured = process.env.AUTH_ORIGIN;
  try {
    const url = new URL(configured ?? "");
    const local = url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if ((!local && url.protocol !== "https:") || url.origin !== configured || url.username || url.password) throw new Error();
    return url.origin;
  } catch { throw new AuthRequestError(503, unavailable); }
}

function safeResponse(status: number, error?: string) {
  const response = NextResponse.json(error ? { ok: false, error } : { ok: true }, { status });
  setPrivateNoStore(response.headers);
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

function clearLink(response: NextResponse) {
  response.cookies.set(linkCookie, "", { ...secureCookieOptions({ maxAge: 0, expires: new Date(0) }), path: "/api/auth/activation" });
}

function clearSetup(response: NextResponse, header: string | null) {
  const name = `${getSupabaseConfiguration().cookieName}-activation`;
  const state = createAuthCookieState(header, name);
  state.clear();
  response.cookies.set(name, "", secureCookieOptions({ maxAge: 0, expires: new Date(0) }));
  for (const write of state.pendingWrites()) response.cookies.set(write.name, "", secureCookieOptions({ maxAge: 0, expires: new Date(0) }));
  clearLink(response);
}

function pendingLink(header: string | null) {
  const entries = (header ?? "").split(";").map(part => part.trim()).filter(part => part.split("=")[0] === linkCookie);
  if (entries.length !== 1) return null;
  const value = entries[0].slice(linkCookie.length + 1);
  return /^[a-f0-9]{40,128}$/.test(value) ? value : null;
}

export async function authorizeActivation(scoped: RequestSupabaseClient): Promise<PortalAuthorization> {
  try {
    const result = await authorizePortalClient(scoped);
    if (result.status !== "authorized") return result;
    const validated = await scoped.client.auth.getUser();
    if (validated.error) return isInvalidProviderIdentity(validated.error)
      ? { status: "ineligible", reason: "anonymous-or-invalid" } : { status: "unavailable", reason: "provider" };
    const user = validated.data.user;
    if (user?.id !== result.user.id || !user.email_confirmed_at || !user.invited_at
      || user.app_metadata?.taxtrax_client_invitation !== "taxtrax-client-invite-v1") {
      return { status: "ineligible", reason: "anonymous-or-invalid" };
    }
    return result;
  } catch { return { status: "unavailable", reason: "provider" }; }
}

export async function activationCallback(request: Request) {
  try {
    const url = new URL(request.url);
    const hash = url.searchParams.get("token_hash");
    const valid = url.searchParams.size === 2 && url.searchParams.getAll("token_hash").length === 1
      && url.searchParams.getAll("type").length === 1 && url.searchParams.get("type") === "invite"
      && typeof hash === "string" && /^[a-f0-9]{40,128}$/.test(hash);
    const response = NextResponse.redirect(`${origin()}/portal/activate${valid ? "" : "?invalid=1"}`, 303);
    clearSetup(response, request.headers.get("cookie"));
    if (valid) response.cookies.set(linkCookie, hash, { ...secureCookieOptions({ maxAge: 3600 }), path: "/api/auth/activation" });
    setPrivateNoStore(response.headers);
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch { return safeResponse(503, unavailable); }
}

export async function verifyInvitation(request: Request) {
  let scoped;
  try {
    const body = await readAuthRequest(request);
    if (Object.keys(body).length) throw new AuthRequestError(400, "Invalid request.");
    const hash = pendingLink(request.headers.get("cookie"));
    if (!hash) return safeResponse(401, invalidLink);
    scoped = createRequestSupabaseClient(null, () => {}, process.env, undefined, "activation");
    const verified = await scoped.client.auth.verifyOtp({ token_hash: hash, type: "invite" });
    if (verified.error) {
      const response = safeResponse(verified.error.status && verified.error.status >= 500 ? 503 : 401, verified.error.status && verified.error.status >= 500 ? unavailable : invalidLink);
      clearLink(response);
      return response;
    }
    const eligible = await authorizeActivation(scoped);
    if (eligible.status !== "authorized") {
      await scoped.client.auth.signOut({ scope: "local" });
      const response = safeResponse(eligible.status === "unavailable" ? 503 : 401, eligible.status === "unavailable" ? unavailable : invalidLink);
      clearLink(response);
      return response;
    }
    const response = safeResponse(200);
    clearSetup(response, request.headers.get("cookie"));
    for (const write of scoped.state.pendingWrites()) response.cookies.set(write.name, write.value, write.options);
    return response;
  } catch (error) {
    if (scoped?.state.hasSessionWrites()) await scoped.client.auth.signOut({ scope: "local" }).catch(() => {});
    return safeResponse(error instanceof AuthRequestError ? error.status : 503, error instanceof AuthRequestError ? error.message : unavailable);
  }
}

export async function setFirstPassword(request: Request) {
  try {
    const body = await readAuthRequest(request);
    if (Object.keys(body).length !== 2 || !Object.hasOwn(body, "password") || !Object.hasOwn(body, "confirm")) throw new AuthRequestError(400, "Invalid request.");
    let revocationStatus: number | undefined;
    const scoped = createRequestSupabaseClient(request.headers.get("cookie"), () => {}, process.env, status => { revocationStatus = status; }, "activation");
    const eligible = await authorizeActivation(scoped);
    if (eligible.status !== "authorized") {
      const response = safeResponse(eligible.status === "unavailable" ? 503 : 401, eligible.status === "unavailable" ? unavailable : invalidLink);
      clearSetup(response, request.headers.get("cookie"));
      return response;
    }
    const error = checkPassword(body.password, eligible.user.email, eligible.user.name);
    if (error || body.password !== body.confirm) {
      const response = safeResponse(400, error ?? "Passwords do not match.");
      for (const write of scoped.state.pendingWrites()) response.cookies.set(write.name, write.value, write.options);
      return response;
    }
    const updated = await scoped.client.auth.updateUser({ password: body.password as string });
    if (updated.error) {
      const response = safeResponse(updated.error.status && updated.error.status >= 500 ? 503 : 400, "Unable to set the password. Check the password rules or contact the TaxTrax team.");
      for (const write of scoped.state.pendingWrites()) response.cookies.set(write.name, write.value, write.options);
      return response;
    }
    const revoked = await scoped.client.auth.signOut({ scope: "global" });
    const confirmed = !revoked.error && revocationStatus !== undefined && revocationStatus >= 200 && revocationStatus < 300;
    const response = safeResponse(confirmed ? 200 : 503, confirmed ? undefined : "Your password was set, but sign-out could not be confirmed. Try signing in again.");
    clearSetup(response, request.headers.get("cookie"));
    const portalName = getSupabaseConfiguration().cookieName;
    const portal = createAuthCookieState(request.headers.get("cookie"), portalName);
    portal.clear();
    response.cookies.set(portalName, "", secureCookieOptions({ maxAge: 0, expires: new Date(0) }));
    for (const write of portal.pendingWrites()) response.cookies.set(write.name, write.value, write.options);
    return response;
  } catch (error) {
    return safeResponse(error instanceof AuthRequestError ? error.status : 503, error instanceof AuthRequestError ? error.message : unavailable);
  }
}
