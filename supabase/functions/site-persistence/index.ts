import { sitePersistence } from "./core.mjs";
import { siteProvider } from "./provider.mjs";

Deno.serve((request: Request) => sitePersistence(request, {
  ingest: Deno.env.get("SITE_INGEST_SECRET"),
  admin: Deno.env.get("SITE_ADMIN_DATA_SECRET"),
}, siteProvider(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))));
