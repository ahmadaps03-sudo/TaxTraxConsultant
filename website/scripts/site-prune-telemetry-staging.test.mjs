import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { pruneStagingTelemetry } from "./site-prune-telemetry-staging.mjs";

const ref = "abcdefghijklmnopqrst";
const secret = "s".repeat(43);
const environment = {
  STAGING_TELEMETRY_PRUNE_ENABLED: "1", STAGING_SUPABASE_REF: ref, STAGING_SUPABASE_URL: `https://${ref}.supabase.co`,
  STAGING_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic", STAGING_SITE_ADMIN_DATA_SECRET: secret,
};

test("pruning is inert unless explicitly enabled and fully configured", async () => {
  for (const change of [{ STAGING_TELEMETRY_PRUNE_ENABLED: "" }, { STAGING_SUPABASE_REF: "short" },
    { STAGING_SUPABASE_URL: "https://other-project.supabase.co" }, { STAGING_SUPABASE_PUBLISHABLE_KEY: "eyJ.legacy" },
    { STAGING_SITE_ADMIN_DATA_SECRET: "short" }]) {
    let called = false;
    await assert.rejects(pruneStagingTelemetry({ ...environment, ...change }, async () => { called = true; }), error => !error.message.includes(secret));
    assert.equal(called, false);
  }
});

test("pruning calls only the scoped prune capability of the configured project", async () => {
  const calls = [];
  await pruneStagingTelemetry(environment, async (url, options) => { calls.push({ url, options }); return Response.json({ ok: true }); });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `https://${ref}.supabase.co/functions/v1/site-persistence`);
  assert.equal(calls[0].options.redirect, "error");
  assert.equal(calls[0].options.headers.Authorization, `Bearer ${secret}`);
  assert.deepEqual(JSON.parse(calls[0].options.body), { action: "telemetry_prune" });
  await assert.rejects(pruneStagingTelemetry(environment, async () => Response.json({ ok: false })), /failed/);
  await assert.rejects(pruneStagingTelemetry(environment, async () => new Response("", { status: 500 })), /failed/);
});

test("workflow is opt-in, keeps the secret in GitHub secrets and uses Node 22", async () => {
  const workflow = await readFile(new URL("../../.github/workflows/staging-telemetry-prune.yml", import.meta.url), "utf8");
  assert.match(workflow, /if: vars\.STAGING_TELEMETRY_PRUNE_ENABLED == '1'/);
  assert.match(workflow, /STAGING_SITE_ADMIN_DATA_SECRET: \$\{\{ secrets\.STAGING_SITE_ADMIN_DATA_SECRET \}\}/);
  assert.match(workflow, /node-version: '22\.19\.0'/);
  assert.doesNotMatch(workflow, /SERVICE_ROLE|service_role|DB_PASSWORD|DATABASE_URL/);
});
