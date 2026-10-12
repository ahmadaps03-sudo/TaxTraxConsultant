import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
import { devUrl } from "./supabase-shared-dev.mjs";

nextEnv.loadEnvConfig(fileURLToPath(new URL("../", import.meta.url)));

const command = process.argv[2];
if ((command !== "status" && command !== "cleanup") || process.argv.length !== 3) throw new Error("Use status or cleanup only.");
if (process.env.SUPABASE_URL !== devUrl || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(process.env.SUPABASE_PUBLISHABLE_KEY ?? "")
  || !/^[A-Za-z0-9_-]{43,128}$/.test(process.env.SITE_ADMIN_DATA_SECRET ?? "")) throw new Error("Approved Dev configuration required.");

try {
  const response = await fetch(`${devUrl}/functions/v1/site-persistence`, {
    method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(30000),
    headers: { "Content-Type": "application/json", apikey: process.env.SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${process.env.SITE_ADMIN_DATA_SECRET}` },
    body: JSON.stringify({ action: "video_orphan_cleanup", dryRun: command === "status" }),
  });
  if (!response.ok) throw new Error();
  const result = await response.json();
  if (result?.ok !== true || !Number.isInteger(result.data?.eligible) || !Number.isInteger(result.data?.removed)) throw new Error();
  console.log(`Dev site-video orphans eligible: ${result.data.eligible}; removed: ${result.data.removed}. No paths or credentials printed.`);
} catch {
  console.error("Dev site-video orphan audit failed safely; no credentials or paths printed.");
  process.exitCode = 1;
}
