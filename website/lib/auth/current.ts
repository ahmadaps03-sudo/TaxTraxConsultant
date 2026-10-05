import "server-only";
import { redirect } from "next/navigation";
import { createPortalServerClient } from "../supabase/server";
import { SupabaseConfigurationError } from "../supabase/config";
import { authorizePortalClient, type PortalAuthorization } from "./authorize";

export class PortalAuthenticationUnavailable extends Error {
  constructor() {
    super("Client authentication is temporarily unavailable.");
    this.name = "PortalAuthenticationUnavailable";
  }
}

export async function getCurrentUserResult(): Promise<PortalAuthorization> {
  try {
    return await authorizePortalClient(createPortalServerClient());
  } catch (error) {
    return { status: "unavailable", reason: error instanceof SupabaseConfigurationError ? "configuration" : "provider" };
  }
}

export async function getCurrentUser() {
  const result = await getCurrentUserResult();
  if (result.status === "unavailable") throw new PortalAuthenticationUnavailable();
  return result.status === "authorized" ? result.user : null;
}

export async function requireUserPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/portal");
  return user;
}
