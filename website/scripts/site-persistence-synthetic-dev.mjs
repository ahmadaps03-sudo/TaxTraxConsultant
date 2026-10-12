import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
import { devRef, devUrl } from "./supabase-shared-dev.mjs";

nextEnv.loadEnvConfig(fileURLToPath(new URL("../", import.meta.url)));

const marker = "taxtrax-site-slice2-fixture-v1";
const email = "slice2-site@example.invalid";
const definitions = [
  { collection: "messages", key: "message", data: { read: false, name: "Synthetic Site Visitor", email, phone: "+44 7700 900123", subject: "Synthetic question", service: "Consultation", message: "Synthetic test message only." } },
  { collection: "bookings", key: "booking", data: { status: "pending", name: "Synthetic Site Visitor", email, phone: "+44 7700 900123", date: "2099-01-01", time: "10:00", service: "Consultation", revenue: "", timeline: "" } },
  { collection: "leads", key: "lead", data: { name: "Synthetic Site Visitor", email, whatsapp: "", reportTitle: "Synthetic report" } },
  ...["true", "false", "missing"].map(state => ({ collection: "posts", key: `post-${state}`, data: {
    slug: `taxtrax-slice2-${state}-fixture`, title: `Synthetic ${state} post`, category: "Test", excerpt: "Synthetic content only.", author: "TaxTrax Test", date: "2026-10-12", content: ["Synthetic content only."], ...(state === "missing" ? {} : { published: state === "true" }),
  } })),
  ...["true", "false", "missing"].map(state => ({ collection: "videos", key: `video-${state}`, data: {
    kind: "youtube", youtubeId: "dQw4w9WgXcQ", title: `Synthetic ${state} video`, category: "Test", description: "Synthetic content only.", ...(state === "missing" ? {} : { published: state === "true" }),
  } })),
];

async function main() {
  const [command, ...extra] = process.argv.slice(2);
  if (!["status", "seed", "cleanup"].includes(command) || extra.length) throw new Error("Use status, seed or cleanup only.");
  if (process.env.SUPABASE_URL !== devUrl || new URL(process.env.SUPABASE_URL).hostname !== `${devRef}.supabase.co`
    || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(process.env.SUPABASE_PUBLISHABLE_KEY ?? "")
    || !/^[A-Za-z0-9_-]{43,128}$/.test(process.env.SITE_ADMIN_DATA_SECRET ?? "")
    || process.env.SITE_ADMIN_DATA_SECRET === process.env.SITE_INGEST_SECRET) throw new Error("Approved Dev configuration is required.");

  async function call(body) {
    const response = await fetch(`${devUrl}/functions/v1/site-persistence`, {
      method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10000),
      headers: { "Content-Type": "application/json", apikey: process.env.SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${process.env.SITE_ADMIN_DATA_SECRET}` },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error("Dev site-persistence capability unavailable.");
    const result = await response.json();
    if (result?.ok !== true) throw new Error("Dev site-persistence capability unavailable.");
    return result.data;
  }

  let found = 0;
  for (const collection of ["messages", "bookings", "leads", "posts", "videos"]) {
    const rows = await call({ action: "record_list", collection });
    if (!Array.isArray(rows)) throw new Error("Unexpected Dev fixture response.");
    for (const definition of definitions.filter(item => item.collection === collection)) {
      const existing = rows.filter(row => row._taxtraxFixture === marker && row._taxtraxFixtureKey === definition.key);
      if (existing.length > 1) throw new Error("Duplicate synthetic fixture; inspect Dev before retrying.");
      if (existing.length) found++;
      if (command === "seed" && !existing.length) {
        await call({ action: "record_add", collection, data: { ...definition.data, _taxtraxFixture: marker, _taxtraxFixtureKey: definition.key } });
        found++;
      }
      if (command === "cleanup" && existing.length) {
        if (typeof existing[0].id !== "string") throw new Error("Unexpected synthetic fixture ID.");
        const removed = await call({ action: "record_delete", collection, id: existing[0].id });
        if (removed?.id !== existing[0].id) throw new Error("Synthetic fixture cleanup could not be confirmed.");
        found--;
      }
    }
  }
  console.log(`Synthetic Dev site fixtures: ${found}/${definitions.length} present after ${command}. No record contents printed.`);
}

main().catch(() => { console.error("Synthetic Dev site fixture operation failed safely; no credentials or records printed."); process.exitCode = 1; });
