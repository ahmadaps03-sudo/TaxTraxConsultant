import "server-only";

export class SupabaseConfigurationError extends Error {
  constructor() {
    super("Client authentication configuration is unavailable.");
    this.name = "SupabaseConfigurationError";
  }
}

export function getSupabaseConfiguration(environment = process.env) {
  const key = environment.SUPABASE_PUBLISHABLE_KEY;
  let url: URL;
  try {
    url = new URL(environment.SUPABASE_URL ?? "");
  } catch {
    throw new SupabaseConfigurationError();
  }
  const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((!localHttp && url.protocol !== "https:") || url.username || url.password || url.pathname !== "/" || url.search || url.hash || !key || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
    throw new SupabaseConfigurationError();
  }
  const cookieIdentifier = url.hostname.split(".")[0].replace(/[^A-Za-z0-9_-]/g, "_");
  return { url: url.origin, key, cookieName: `sb-${cookieIdentifier}-auth-token` };
}
