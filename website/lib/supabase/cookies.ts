import "server-only";
import type { CookieOptions } from "@supabase/ssr";

export type AuthCookieWrite = { name: string; value: string; options: CookieOptions };

export function secureCookieOptions(options: CookieOptions = {}, production = process.env.NODE_ENV === "production"): CookieOptions {
  const { domain, ...remaining } = options;
  return { ...remaining, httpOnly: true, sameSite: "lax", path: "/", secure: production };
}

function validSessionEncoding(value: string) {
  try {
    if (!/^base64-[A-Za-z0-9_-]+$/.test(value)) return false;
    const encoded = value.slice(7).replaceAll("-", "+").replaceAll("_", "/");
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    const session = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    return session !== null && typeof session === "object" && !Array.isArray(session)
      && typeof session.access_token === "string" && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(session.access_token)
      && typeof session.refresh_token === "string" && /^[A-Za-z0-9_-]+$/.test(session.refresh_token)
      && typeof session.expires_at === "number" && Number.isFinite(session.expires_at)
      && session.user !== null && typeof session.user === "object" && typeof session.user.id === "string";
  } catch {
    return false;
  }
}

export function createAuthCookieState(header: string | null, cookieName: string) {
  const entries = new Map<string, string>();
  const originalNames = new Set<string>();
  const writes = new Map<string, AuthCookieWrite>();
  const unrelated: string[] = [];
  let malformed = false;
  const isFamily = (name: string) => name === cookieName || name.startsWith(`${cookieName}.`);
  for (const segment of (header ?? "").split(";")) {
    if (!segment.trim()) continue;
    const separator = segment.indexOf("=");
    const name = (separator < 0 ? segment : segment.slice(0, separator)).trim();
    if (!isFamily(name)) {
      unrelated.push(segment.trim());
      continue;
    }
    originalNames.add(name);
    if (entries.has(name) || separator < 0 || !/^[A-Za-z0-9_.-]+$/.test(name)) malformed = true;
    try {
      const value = decodeURIComponent(segment.slice(separator + 1).trim());
      entries.set(name, value);
      if (!value) malformed = true;
    } catch {
      malformed = true;
    }
  }
  const chunks = [...entries.keys()].filter(name => name !== cookieName);
  if (entries.has(cookieName) && chunks.length) malformed = true;
  const indexes = chunks.map(name => {
    const suffix = name.slice(cookieName.length + 1);
    if (!/^(0|[1-9][0-9]*)$/.test(suffix)) malformed = true;
    return Number(suffix);
  }).sort((left, right) => left - right);
  if (indexes.some((index, position) => index !== position) || indexes.length > 32) malformed = true;
  const combined = entries.get(cookieName) ?? indexes.map(index => entries.get(`${cookieName}.${index}`) ?? "").join("");
  if (entries.size && (combined.length > 65_536 || !validSessionEncoding(combined))) malformed = true;

  function clear() {
    for (const name of new Set([...originalNames, ...entries.keys()])) {
      if (/^[A-Za-z0-9_.-]+$/.test(name)) writes.set(name, { name, value: "", options: secureCookieOptions({ maxAge: 0, expires: new Date(0) }) });
    }
    entries.clear();
  }
  if (malformed) clear();

  return {
    malformed,
    getAll: () => [...entries].map(([name, value]) => ({ name, value })),
    setAll: (changes: AuthCookieWrite[]) => {
      for (const change of changes) {
        if (!isFamily(change.name)) throw new Error("Unsupported authentication cookie write.");
        const normalized = { ...change, options: secureCookieOptions(change.options) };
        writes.set(change.name, normalized);
        if (!change.value || (change.options.maxAge !== undefined && change.options.maxAge <= 0) || (change.options.expires && change.options.expires.getTime() <= Date.now())) entries.delete(change.name);
        else entries.set(change.name, change.value);
      }
    },
    clear,
    pendingWrites: () => [...writes.values()],
    hasSessionWrites: () => [...writes.values()].some(write => Boolean(write.value)),
    forwardedHeader: () => [...unrelated, ...[...entries].map(([name, value]) => `${name}=${encodeURIComponent(value)}`)].join("; "),
  };
}

export type AuthCookieState = ReturnType<typeof createAuthCookieState>;
