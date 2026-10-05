import "server-only";
import type { RequestSupabaseClient } from "../supabase/client";

export type ClientIdentity = { id: string; email: string; name: string };
export type PortalAuthorization =
  | { status: "authorized"; user: ClientIdentity }
  | { status: "ineligible"; reason: "anonymous-or-invalid" | "unconfirmed" | "no-active-profile" }
  | { status: "unavailable"; reason: "configuration" | "provider" | "cookie-persistence" };

export function isInvalidProviderIdentity(error: { status?: number; name?: string; code?: string }) {
  return error.name === "AuthSessionMissingError" || error.status === 401 || error.status === 403
    || ["bad_jwt", "session_not_found", "refresh_token_not_found", "refresh_token_already_used", "user_not_found", "user_banned"].includes(error.code ?? "");
}

export async function authorizePortalClient(requestClient: RequestSupabaseClient): Promise<PortalAuthorization> {
  try {
    const { client, state, writable } = requestClient;
    const validated = await client.auth.getUser();
    if (validated.error) {
      if (isInvalidProviderIdentity(validated.error)) {
        state.clear();
        return { status: "ineligible", reason: "anonymous-or-invalid" };
      }
      return { status: "unavailable", reason: "provider" };
    }
    const user = validated.data.user;
    if (!user?.id || !user.email) return { status: "ineligible", reason: "anonymous-or-invalid" };
    if (!user.email_confirmed_at) return { status: "ineligible", reason: "unconfirmed" };
    if (!writable && state.hasSessionWrites()) return { status: "unavailable", reason: "cookie-persistence" };
    const profile = await client.from("client_profiles").select("user_id,name,status").eq("user_id", user.id).maybeSingle();
    if (profile.error) return { status: "unavailable", reason: "provider" };
    if (!profile.data || profile.data.user_id !== user.id || profile.data.status !== "active" || typeof profile.data.name !== "string") {
      return { status: "ineligible", reason: "no-active-profile" };
    }
    return { status: "authorized", user: { id: user.id, email: user.email, name: profile.data.name } };
  } catch {
    return { status: "unavailable", reason: "provider" };
  }
}
