import { pathToFileURL } from "node:url";

export async function pruneStagingTelemetry(environment = process.env, transport = fetch) {
  const ref = environment.STAGING_SUPABASE_REF;
  const url = environment.STAGING_SUPABASE_URL;
  const key = environment.STAGING_SUPABASE_PUBLISHABLE_KEY;
  const secret = environment.STAGING_SITE_ADMIN_DATA_SECRET;
  if (environment.STAGING_TELEMETRY_PRUNE_ENABLED !== "1" || !/^[a-z0-9]{20}$/.test(ref ?? "")
    || url !== `https://${ref}.supabase.co` || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key ?? "")
    || !/^[A-Za-z0-9_-]{43,128}$/.test(secret ?? "")) throw new Error("Staging telemetry pruning is not configured.");
  const response = await transport(`${url}/functions/v1/site-persistence`, {
    method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(30_000),
    headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${secret}` },
    body: JSON.stringify({ action: "telemetry_prune" }),
  });
  if (!response.ok || (await response.json().catch(() => null))?.ok !== true) throw new Error("Staging telemetry pruning failed.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  pruneStagingTelemetry().then(() => console.log("Staging telemetry retention completed."))
    .catch(() => { console.error("Staging telemetry retention unavailable; no private details logged."); process.exitCode = 1; });
}
