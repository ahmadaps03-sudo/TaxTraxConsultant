import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
import { devUrl } from "./supabase-shared-dev.mjs";

nextEnv.loadEnvConfig(fileURLToPath(new URL("../", import.meta.url)));

if (process.argv.length !== 2 || process.env.SUPABASE_URL !== devUrl
  || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(process.env.SUPABASE_PUBLISHABLE_KEY ?? "")
  || !/^[A-Za-z0-9_-]{43,128}$/.test(process.env.SITE_ADMIN_DATA_SECRET ?? "")) {
  throw new Error("Approved Dev configuration is required.");
}

try {
  const response = await fetch(`${devUrl}/functions/v1/site-persistence`, {
    method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(30000),
    headers: { "Content-Type": "application/json", apikey: process.env.SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${process.env.SITE_ADMIN_DATA_SECRET}` },
    body: JSON.stringify({ action: "telemetry_prune" }),
  });
  if (!response.ok || (await response.json())?.ok !== true) throw new Error();
  console.log("Dev site telemetry retention completed. No visitor data or credentials printed.");
} catch {
  console.error("Dev site telemetry retention failed safely; no visitor data or credentials printed.");
  process.exitCode = 1;
}
