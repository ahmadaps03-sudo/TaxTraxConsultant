import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME } from "./constants";
import { getUserByToken } from "./session";

/** For Server Components: the logged-in user (validated against the database) or null. */
export const getCurrentUser = () => getUserByToken(cookies().get(COOKIE_NAME)?.value);

export function requireUserPage() {
  const u = getCurrentUser();
  if (!u) redirect("/login?next=/portal");
  return u;
}

/** Only allow same-site relative redirects (prevents open-redirect attacks via ?next=). */
export const safeNext = (n?: string) => (n && /^\/(?!\/)[^\\]*$/.test(n) ? n : "/portal");
