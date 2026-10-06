import assert from "node:assert/strict";
import test from "node:test";
import { devRef, devUrl, isDevProvisioningKey, requireDevTarget, selectDevKeys, updateDevEnv } from "./supabase-shared-dev.mjs";

const publishableKey = "sb_publishable_synthetic_shared_dev_test";

test("only explicitly approved Dev ref is accepted", () => {
  requireDevTarget(devRef);
  for (const ref of [undefined, "production", "another-project"]) assert.throws(() => requireDevTarget(ref));
});

test("runtime selection rejects legacy/secret keys and selects publishable format", () => {
  assert.equal(selectDevKeys([{ type: "publishable", api_key: publishableKey }]).publishableKey, publishableKey);
  for (const key of ["eyJ.synthetic.anon", "sb_secret_synthetic", "invalid"]) assert.throws(() => selectDevKeys([{ type: "publishable", api_key: key }]));
});

test("Dev environment preserves unrelated values and is idempotent", () => {
  const original = 'ADMIN_API_KEY="synthetic-unrelated"\nDATA_DIR=./data\nSUPABASE_URL=http://127.0.0.1:55321\nSUPABASE_PUBLISHABLE_KEY=old\n';
  const result = updateDevEnv(original, publishableKey);
  assert.ok(result.startsWith('ADMIN_API_KEY="synthetic-unrelated"\nDATA_DIR=./data\n'));
  assert.ok(result.includes(`SUPABASE_URL="${devUrl}"`));
  assert.ok(result.includes('AUTH_ORIGIN="http://localhost:3000"'));
  assert.equal(updateDevEnv(result, publishableKey), result);
});

test("owner-only legacy provisioning key must be service_role for the exact Dev ref", () => {
  const token = claims => `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.synthetic`;
  const key = token({ role: "service_role", ref: devRef });
  assert.equal(isDevProvisioningKey(key), true);
  for (const claims of [{ role: "anon", ref: devRef }, { role: "service_role", ref: "other-project" }]) assert.equal(isDevProvisioningKey(token(claims)), false);
  const selected = selectDevKeys([{ type: "publishable", api_key: publishableKey }, { type: "secret", api_key: "sb_secret_redacted..." }, { type: "legacy", name: "service_role", api_key: key }]);
  assert.equal(selected.publishableKey, publishableKey);
  assert.equal(selected.adminKey, key);
  assert.ok(!updateDevEnv("", selected.publishableKey).includes(key));
});

test("configuration for another remote project is never overwritten", () => {
  assert.throws(() => updateDevEnv("SUPABASE_URL=https://other-project.supabase.co\n", publishableKey));
});

test("privileged Supabase runtime assignments are rejected", () => {
  for (const content of ["SUPABASE_SECRET_KEY=synthetic\n", "SUPABASE_DB_PASSWORD=synthetic\n", "OTHER_KEY=sb_secret_synthetic\n"]) assert.throws(() => updateDevEnv(content, publishableKey));
});

test("canonical local origin and CRLF are preserved", () => {
  const result = updateDevEnv("AUTH_ORIGIN='http://127.0.0.1:3001' # local\r\nADMIN_API_KEY=synthetic\r\n", publishableKey);
  assert.ok(result.startsWith("AUTH_ORIGIN='http://127.0.0.1:3001' # local\r\nADMIN_API_KEY=synthetic\r\n"));
  assert.equal(result.replaceAll("\r\n", "").includes("\n"), false);
});

test("remote, duplicate and noncanonical auth origins fail safely", () => {
  for (const origin of ["https://other.example", "http://localhost:3000/", "null"]) assert.throws(() => updateDevEnv(`AUTH_ORIGIN=${origin}\n`, publishableKey));
  assert.throws(() => updateDevEnv("AUTH_ORIGIN=http://localhost:3000\nAUTH_ORIGIN=http://localhost:3000\n", publishableKey));
});
