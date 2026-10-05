import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createAuthCookieState, secureCookieOptions, type AuthCookieWrite } from "./cookies";
import { getSupabaseConfiguration } from "./config";

export function createRequestSupabaseClient(cookieHeader: string | null, writeCookies?: (changes: AuthCookieWrite[]) => void, environment = process.env, observeLocalSignOut?: (status: number, sessionMissing: boolean) => void) {
  const configuration = getSupabaseConfiguration(environment);
  const state = createAuthCookieState(cookieHeader, configuration.cookieName);
  const client = createServerClient(configuration.url, configuration.key, {
    cookieEncoding: "base64url",
    cookieOptions: { name: configuration.cookieName, ...secureCookieOptions() },
    cookies: {
      getAll: state.getAll,
      setAll: changes => {
        state.setAll(changes);
        writeCookies?.(state.pendingWrites());
      },
    },
    auth: { debug: false },
    global: { fetch: async (input, options) => {
      try {
        const target = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
        if (target.origin !== configuration.url) throw new Error("Unexpected authentication origin.");
        const response = await fetch(input, { ...options, cache: "no-store", redirect: "error", signal: options?.signal ?? AbortSignal.timeout(5_000) });
        if (observeLocalSignOut && target.pathname === "/auth/v1/logout" && target.searchParams.get("scope") === "local" && options?.method?.toUpperCase() === "POST") {
          const failure = response.status >= 400 && response.status < 500 ? await response.clone().json().catch(() => null) : null;
          observeLocalSignOut(response.status, (failure?.code ?? failure?.error_code) === "session_not_found");
        }
        return response;
      } catch {
        return new Response('{"message":"Authentication service unavailable."}', { status: 503, headers: { "Content-Type": "application/json" } });
      }
    } },
  });
  return { client, state, writable: Boolean(writeCookies) };
}

export type RequestSupabaseClient = ReturnType<typeof createRequestSupabaseClient>;
