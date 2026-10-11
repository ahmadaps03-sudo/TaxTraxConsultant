import { portalAdmin } from "./core.mjs";
import { portalProvider } from "./provider.mjs";

Deno.serve((request: Request) => {
  const secret = Deno.env.get("ADMIN_PORTAL_SECRET");
  const reused = [Deno.env.get("ADMIN_ACCESS_REQUEST_SECRET"), Deno.env.get("ACCESS_REQUEST_SUBMISSION_SECRET")].includes(secret);
  return portalAdmin(request, reused ? undefined : secret,
    portalProvider(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")));
});
