import { execFile } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createClient } from "@supabase/supabase-js";

export const devRef = "dbcakdqthnamgjfkkxzn";
export const devUrl = `https://${devRef}.supabase.co`;
export const fixtureEmail = "active-a.shared-dev@taxtrax.example.invalid";
export const credentialPath = path.join(homedir(), ".config", "taxtrax", "dev-login.json");
const website = fileURLToPath(new URL("../", import.meta.url));
const repository = path.resolve(website, "..");
const executeFile = promisify(execFile);
const fixtureMarker = "taxtrax-shared-dev-v1";

export class SharedDevSetupError extends Error {}

export function requireDevTarget(ref) {
  if (ref !== devRef) throw new SharedDevSetupError("The repository must be linked to the approved DEVELOPMENT project only.");
}

export function isDevProvisioningKey(key) {
  if (/^sb_secret_[A-Za-z0-9_-]+$/.test(key ?? "")) return true;
  try {
    if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)) return false;
    const claims = JSON.parse(Buffer.from(key.split(".")[1], "base64url"));
    return claims.role === "service_role" && claims.ref === devRef;
  } catch { return false; }
}

export function selectDevKeys(keys) {
  if (!Array.isArray(keys)) throw new SharedDevSetupError("Unexpected Dev API-key response.");
  const publishableKey = keys.find(item => item.type === "publishable")?.api_key;
  const secretKey = keys.find(item => item.type === "secret")?.api_key;
  const legacyAdmin = keys.find(item => item.type === "legacy" && item.name === "service_role")?.api_key;
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey ?? "")) throw new SharedDevSetupError("Obtain the Dev publishable key from the project's Connect dialog; never use a legacy anon key.");
  return { publishableKey, adminKey: isDevProvisioningKey(secretKey) ? secretKey : isDevProvisioningKey(legacyAdmin) ? legacyAdmin : undefined };
}

export async function readDevKeys() {
  requireDevTarget((await readFile(path.join(repository, "supabase", ".temp", "project-ref"), "utf8")).trim());
  try {
    const executable = path.join(website, "node_modules", "supabase", "bin", process.platform === "win32" ? "supabase.exe" : "supabase");
    const result = await executeFile(executable, ["projects", "api-keys", "--project-ref", devRef, "--output", "json", "--workdir", repository], { timeout: 30_000, maxBuffer: 1024 * 1024, windowsHide: true });
    return selectDevKeys(JSON.parse(result.stdout));
  } catch (error) {
    if (error instanceof SharedDevSetupError) throw error;
    throw new SharedDevSetupError("Cannot read Dev keys. Check CLI login/link, or obtain the publishable key privately from the Dev dashboard. Raw CLI output is suppressed.");
  }
}

export function updateDevEnv(content, publishableKey) {
  selectDevKeys([{ type: "publishable", api_key: publishableKey }]);
  const newline = content.includes("\r\n") ? "\r\n" : "\n";
  const lines = content.split(newline);
  for (const line of lines) {
    const assignment = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!assignment) continue;
    const value = assignment[2].trim().replace(/^['"]|['"]$/g, "");
    let privilegedJwt = false;
    try { privilegedJwt = JSON.parse(Buffer.from(value.split(".")[1], "base64url")).role === "service_role"; } catch {}
    if (value && (/^(SUPABASE_(SERVICE_ROLE_KEY|SECRET_KEY|DB_PASSWORD|JWT_SECRET)|SERVICE_ROLE_KEY|JWT_SECRET)$/.test(assignment[1]) || value.includes("sb_secret_") || privilegedJwt)) {
      throw new SharedDevSetupError("Remove privileged Supabase credentials from website runtime environment files before continuing.");
    }
    if (assignment[1] === "SUPABASE_URL" && value) {
      let target;
      try { target = new URL(value); } catch { throw new SharedDevSetupError("Existing Supabase URL is invalid."); }
      if (target.origin !== devUrl && !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname)) throw new SharedDevSetupError("Refusing to overwrite configuration for another remote project.");
    }
  }
  const origins = lines.filter(line => /^\s*(?:export\s+)?AUTH_ORIGIN\s*=/.test(line));
  if (origins.length > 1) throw new SharedDevSetupError("Resolve duplicate AUTH_ORIGIN assignments first.");
  if (origins.length) {
    const value = origins[0].slice(origins[0].indexOf("=") + 1).trim().match(/^(?:"([^"]*)"|'([^']*)'|([^\s#]+))\s*(?:#.*)?$/);
    const origin = value?.[1] ?? value?.[2] ?? value?.[3];
    let parsed;
    try { parsed = new URL(origin); } catch { throw new SharedDevSetupError("AUTH_ORIGIN must be a canonical local HTTP origin."); }
    if (parsed.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) || parsed.origin !== origin) throw new SharedDevSetupError("AUTH_ORIGIN must be a canonical local HTTP origin.");
  }
  const values = { SUPABASE_URL: devUrl, SUPABASE_PUBLISHABLE_KEY: publishableKey };
  const seen = new Set();
  const updated = [];
  for (const line of lines) {
    const name = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.[1];
    if (Object.hasOwn(values, name)) {
      if (!seen.has(name)) updated.push(`${name}=${JSON.stringify(values[name])}`);
      seen.add(name);
    } else updated.push(line);
  }
  if (updated.at(-1) === "") updated.pop();
  for (const [name, value] of Object.entries(values)) if (!seen.has(name)) updated.push(`${name}=${JSON.stringify(value)}`);
  if (!origins.length) updated.push('AUTH_ORIGIN="http://localhost:3000"');
  return updated.join(newline) + newline;
}

async function regularFile(filename) {
  try {
    const metadata = await lstat(filename);
    if (!metadata.isFile() || metadata.isSymbolicLink()) throw new SharedDevSetupError("Configuration/credential path must be a regular file, not a symlink.");
    return await readFile(filename, "utf8");
  } catch (error) { if (error.code === "ENOENT") return undefined; throw error; }
}

async function atomicWrite(filename, content, original) {
  const temporary = `${filename}.${randomUUID()}.tmp`;
  try {
    const file = await open(temporary, "wx", 0o600);
    try { await file.writeFile(content); await file.sync(); } finally { await file.close(); }
    if (await regularFile(filename) !== original) throw new SharedDevSetupError("File changed concurrently; no configuration was replaced.");
    await rename(temporary, filename);
  } finally { await unlink(temporary).catch(error => { if (error.code !== "ENOENT") throw error; }); }
}

export function devClient(key) {
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key ?? "") && !isDevProvisioningKey(key)) throw new SharedDevSetupError("Missing valid Dev API key.");
  return createClient(devUrl, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, debug: false }, global: { fetch: (input, options) => {
    const target = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (target.origin !== devUrl) throw new SharedDevSetupError("Request target is not approved Dev.");
    return fetch(input, { ...options, redirect: "error", signal: options?.signal ?? AbortSignal.timeout(15_000) });
  } } });
}

async function configureEnv(keys) {
  const filename = path.join(website, ".env.local");
  const original = await regularFile(filename);
  const health = await fetch(`${devUrl}/auth/v1/health`, { headers: { apikey: keys.publishableKey }, redirect: "error", signal: AbortSignal.timeout(15_000) });
  if (!health.ok) throw new SharedDevSetupError("Dev Auth is unavailable; environment was not changed.");
  await atomicWrite(filename, updateDevEnv(original ?? "", keys.publishableKey), original);
  console.log("Configured untracked website/.env.local for shared Dev with unprivileged values only. Restart Next.js; no keys printed.");
}

async function provisionLogin(keys) {
  if (!isDevProvisioningKey(keys.adminKey)) throw new SharedDevSetupError("Dev provisioning requires an authenticated owner with access to its privileged API key; never put that key in website environment files.");
  const admin = devClient(keys.adminKey);
  const saved = await regularFile(credentialPath);
  if (saved) {
    const credential = JSON.parse(saved);
    requireDevTarget(credential.projectRef);
    const user = await admin.auth.admin.getUserById(credential.userId);
    const profile = await admin.from("client_profiles").select("user_id,status").eq("user_id", credential.userId).maybeSingle();
    if (user.error || user.data.user?.email !== fixtureEmail || user.data.user?.app_metadata?.taxtrax_shared_dev_fixture !== fixtureMarker || !user.data.user?.email_confirmed_at || profile.error || profile.data?.status !== "active") throw new SharedDevSetupError("Existing synthetic fixture is not eligible; inspect it privately. No account or approval was overwritten.");
    console.log(`Existing synthetic login preserved. Owner credential file: ${credentialPath}. Share privately, never through Git or public logs.`);
    return;
  }
  const password = `${randomBytes(32).toString("base64url")}Aa1!`;
  const result = await admin.auth.admin.createUser({ email: fixtureEmail, password, email_confirm: true, app_metadata: { taxtrax_shared_dev_fixture: fixtureMarker } });
  if (result.error || !result.data.user) throw new SharedDevSetupError("Synthetic identity could not be created (possibly already exists). No existing account was changed; obtain its credential from the owner.");
  const userId = result.data.user.id;
  try {
    const inserted = await admin.from("client_profiles").insert({ user_id: userId, name: "Synthetic Shared Dev Client", status: "pending" });
    if (inserted.error) throw new SharedDevSetupError("Could not create synthetic profile.");
    const approved = await admin.from("client_profiles").update({ status: "active" }).eq("user_id", userId).select("user_id,status").single();
    if (approved.error || approved.data?.status !== "active") throw new SharedDevSetupError("Could not finalize synthetic profile.");
    await mkdir(path.dirname(credentialPath), { recursive: true, mode: 0o700 });
    await atomicWrite(credentialPath, JSON.stringify({ projectRef: devRef, userId, email: fixtureEmail, password }, null, 2) + "\n", undefined);
  } catch {
    const removed = await admin.auth.admin.deleteUser(userId);
    if (removed.error) throw new SharedDevSetupError("Synthetic setup failed and cleanup could not be confirmed. Owner must inspect this new fixture before testing.");
    throw new SharedDevSetupError("Synthetic setup failed; the new identity was removed. No existing identity was changed.");
  }
  console.log(`Synthetic active login ready. Owner credential file: ${credentialPath}. Share via a password manager/private channel; no password printed.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, ...extra] = process.argv.slice(2);
    if (!["env", "seed"].includes(command) || extra.length) throw new SharedDevSetupError("Use env or seed only; arbitrary targets/credentials are not accepted.");
    const keys = await readDevKeys();
    if (command === "env") await configureEnv(keys);
    else await provisionLogin(keys);
  } catch (error) {
    console.error(error instanceof SharedDevSetupError ? error.message : "Shared Dev setup failed. Check the approved link, account access and local file permissions; no credentials printed.");
    process.exitCode = 1;
  }
}
