import "server-only";
import { cookies, headers } from "next/headers";
import { unstable_noStore as noStore } from "next/cache";
import { createRequestSupabaseClient } from "./client";

export function createPortalServerClient(writable = false) {
  noStore();
  const cookieStore = cookies();
  return createRequestSupabaseClient(headers().get("cookie"), writable ? changes => {
    for (const { name, value, options } of changes) cookieStore.set(name, value, options);
  } : undefined);
}
