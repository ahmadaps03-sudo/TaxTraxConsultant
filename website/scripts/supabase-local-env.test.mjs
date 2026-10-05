import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { populateLocalEnv, updateEnvContent, validateLocalStatus } from "./supabase-local-env.mjs";

const key = "sb_publishable_synthetic_test_key";
const values = { SUPABASE_URL: "http://127.0.0.1:55321", SUPABASE_PUBLISHABLE_KEY: key };
const status = { API_URL: values.SUPABASE_URL, PUBLISHABLE_KEY: key, SECRET_KEY: "sb_secret_synthetic_test_key" };
const roleToken = role => `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.synthetic`;

async function withEnvironment(run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "taxtrax-env-test-"));
  try {
    await run(path.join(directory, ".env.local"), directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("local status selects only the publishable key, or a legacy anon key", () => {
  assert.deepEqual(validateLocalStatus(status), values);
  assert.equal(validateLocalStatus({ API_URL: values.SUPABASE_URL, ANON_KEY: roleToken("anon") }).SUPABASE_PUBLISHABLE_KEY, roleToken("anon"));
});

test("remote URLs, credentials, malformed keys and privileged keys are rejected", () => {
  for (const url of ["https://example.com", "http://127.0.0.1:55322", "http://user:password@localhost:55321", "http://localhost:55321/path", "http://localhost:55321/?remote=true"]) {
    assert.throws(() => validateLocalStatus({ ...status, API_URL: url }));
  }
  for (const invalidKey of ["sb_secret_synthetic_test_key", roleToken("service_role"), roleToken("authenticated"), "not-a-key", `${roleToken("anon")}\nOTHER=bad`]) {
    assert.throws(() => validateLocalStatus({ ...status, PUBLISHABLE_KEY: invalidKey }));
  }
  assert.throws(() => validateLocalStatus({ ...status, SECRET_KEY: key }));
});

test("environment updates preserve unrelated values and are idempotent", () => {
  const original = '# existing\nADMIN_API_KEY="synthetic-admin"\nDATA_DIR=./data\nDATABASE_FILE=./data/custom.db\nSUPABASE_URL="http://old.invalid"\nSUPABASE_PUBLISHABLE_KEY=old\nSUPABASE_PUBLISHABLE_KEY=duplicate\n';
  const updated = updateEnvContent(original, values);
  assert.ok(updated.startsWith('# existing\nADMIN_API_KEY="synthetic-admin"\nDATA_DIR=./data\nDATABASE_FILE=./data/custom.db\n'));
  assert.equal(updated.match(/^SUPABASE_PUBLISHABLE_KEY=/gm).length, 1);
  assert.ok(updated.includes('AUTH_ORIGIN="http://localhost:3000"\n'));
  assert.equal(updateEnvContent(updated, values), updated);
  assert.ok(!updated.includes(status.SECRET_KEY));
});

test("an existing local AUTH_ORIGIN and CRLF line endings are preserved", () => {
  const original = "export AUTH_ORIGIN='http://127.0.0.1:3000' # local\r\nADMIN_API_KEY=synthetic\r\n";
  const updated = updateEnvContent(original, values);
  assert.ok(updated.startsWith(original));
  assert.ok(!updated.replaceAll("\r\n", "").includes("\n"));
  assert.equal(updateEnvContent(updated, values), updated);
});

test("nonlocal or duplicate AUTH_ORIGIN and existing privileged credentials fail safely", () => {
  for (const content of ["AUTH_ORIGIN=https://example.com\n", "AUTH_ORIGIN=http://localhost:3000\nAUTH_ORIGIN=http://127.0.0.1:3000\n", "SUPABASE_SERVICE_ROLE_KEY=synthetic\n", "ANY_KEY=sb_secret_synthetic\n", `ANY_KEY=${roleToken("service_role")}\n`]) {
    assert.throws(() => updateEnvContent(content, values));
  }
});

test("writing uses owner-only permissions, preserves unrelated data, and leaves no temporary file", async () => {
  await withEnvironment(async (envPath, directory) => {
    await writeFile(envPath, "ADMIN_API_KEY=synthetic\n");
    await populateLocalEnv({ envPath, readStatus: async () => values, request: async (url, options) => {
      assert.equal(url, "http://127.0.0.1:55321/auth/v1/health");
      assert.equal(options.headers.apikey, key);
      assert.equal(options.redirect, "error");
      return { ok: true };
    } });
    assert.ok((await readFile(envPath, "utf8")).startsWith("ADMIN_API_KEY=synthetic\n"));
    if (process.platform !== "win32") assert.equal((await stat(envPath)).mode & 0o777, 0o600);
    assert.deepEqual(await readdir(directory), [".env.local"]);
  });
});

test("unavailable status or Auth leave the existing environment untouched", async () => {
  await withEnvironment(async envPath => {
    const original = "ADMIN_API_KEY=synthetic\n";
    await writeFile(envPath, original);
    await assert.rejects(populateLocalEnv({ envPath, readStatus: async () => { throw new Error("unavailable"); } }));
    await assert.rejects(populateLocalEnv({ envPath, readStatus: async () => values, request: async () => ({ ok: false }) }));
    await assert.rejects(populateLocalEnv({ envPath, readStatus: async () => values, request: async () => { throw new Error("offline"); } }));
    assert.equal(await readFile(envPath, "utf8"), original);
  });
});

test("invalid or privileged status never creates an environment file", async () => {
  await withEnvironment(async (envPath, directory) => {
    await assert.rejects(populateLocalEnv({ envPath, readStatus: async () => ({ ...values, SUPABASE_PUBLISHABLE_KEY: "sb_secret_synthetic" }) }));
    assert.deepEqual(await readdir(directory), []);
  });
});

test("symlink environment files are rejected without modifying their targets", async context => {
  await withEnvironment(async (envPath, directory) => {
    const target = path.join(directory, "target");
    await writeFile(target, "ADMIN_API_KEY=synthetic\n");
    try {
      await symlink(target, envPath);
    } catch (error) {
      if (process.platform === "win32" && error.code === "EPERM") {
        context.skip("Windows symlink creation requires Developer Mode or permission.");
        return;
      }
      throw error;
    }
    await assert.rejects(populateLocalEnv({ envPath, readStatus: async () => values, request: async () => ({ ok: true }) }), /regular file/);
    assert.equal(await readFile(target, "utf8"), "ADMIN_API_KEY=synthetic\n");
  });
});

test("lifecycle helper refuses an unconfirmed reset and remote arguments before accessing Docker", () => {
  const script = new URL("./supabase-local.mjs", import.meta.url);
  for (const argumentsList of [["reset"], ["reset", "--linked"], ["start", "--project-id", "remote"]]) {
    assert.throws(() => execFileSync(process.execPath, [fileURLToPath(script), ...argumentsList], { stdio: "pipe" }), error => {
      assert.equal(error.status, 1);
      assert.equal(error.stdout.toString(), "");
      assert.ok(!error.stderr.toString().includes("sb_secret_"));
      assert.match(error.stderr.toString(), /Reset deletes|Use start/);
      return true;
    });
  }
});
