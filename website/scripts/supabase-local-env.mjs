import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { lstat, open, readFile, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const executeFile = promisify(execFile);
export const websiteDirectory = fileURLToPath(new URL("../", import.meta.url));
export const repositoryDirectory = path.resolve(websiteDirectory, "..");
const cliPath = path.join(websiteDirectory, "node_modules", "supabase", "bin", process.platform === "win32" ? "supabase.exe" : "supabase");

function assertLocalUrl(value, port, label) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be a local HTTP origin on port ${port}.`);
  }
  if (parsed.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(parsed.hostname) || parsed.port !== String(port) || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error(`${label} must be a local HTTP origin on port ${port}.`);
  }
  return parsed.origin;
}

function jwtRole(value) {
  try {
    const parts = value.split(".");
    if (parts.length !== 3) return undefined;
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")).role;
  } catch {
    return undefined;
  }
}

export function validateLocalStatus(status) {
  const url = assertLocalUrl(status.API_URL, 55321, "Supabase URL");
  const key = status.PUBLISHABLE_KEY || status.ANON_KEY;
  const legacyAnon = typeof key === "string" && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key) && jwtRole(key) === "anon";
  if (typeof key !== "string" || key === status.SECRET_KEY || key === status.SERVICE_ROLE_KEY || (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key) && !legacyAnon)) {
    throw new Error("Local status did not contain an unprivileged Supabase key.");
  }
  return { SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: key };
}

export async function runLocalSupabase(args, timeout = 30_000) {
  const config = await readFile(path.join(repositoryDirectory, "supabase", "config.toml"), "utf8");
  if (!/^project_id\s*=\s*"taxtrax-client-auth"\s*$/m.test(config)) {
    throw new Error("Expected the repository's taxtrax-client-auth local Supabase project.");
  }
  try {
    const result = await executeFile(cliPath, [...args, "--workdir", repositoryDirectory], {
      cwd: repositoryDirectory,
      timeout,
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
    });
    return result.stdout;
  } catch {
    throw new Error("Local Supabase command failed. Check Docker access, available ports, and npm run supabase:start. Raw credential-bearing CLI output is suppressed.");
  }
}

export async function readLocalStatus() {
  let status;
  try {
    status = JSON.parse(await runLocalSupabase(["status", "--output", "json"]));
  } catch {
    throw new Error("Cannot read local Supabase status. Start the repository's stack and check Docker access; no environment values were written.");
  }
  return validateLocalStatus(status);
}

function assertNoPrivilegedCredentials(content) {
  const assignments = content.split(/\r?\n/).map(line => line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)).filter(Boolean);
  for (const assignment of assignments) {
    const value = assignment[2].replace(/^['"]|['"]$/g, "").trim();
    if ((/^(?:SUPABASE_(?:SERVICE_ROLE_KEY|SECRET_KEY|DB_PASSWORD|JWT_SECRET)|SERVICE_ROLE_KEY|SECRET_KEY|JWT_SECRET)$/.test(assignment[1]) && value && !value.startsWith("#")) || /sb_secret_[A-Za-z0-9_-]+/.test(value) || jwtRole(value.split(/\s+#/)[0]) === "service_role") {
      throw new Error("Existing environment contains privileged Supabase credentials. Remove them from the website runtime before running this helper.");
    }
  }
}

export function updateEnvContent(content, values) {
  assertNoPrivilegedCredentials(content);
  const validated = validateLocalStatus({ API_URL: values.SUPABASE_URL, PUBLISHABLE_KEY: values.SUPABASE_PUBLISHABLE_KEY });
  const newline = content.includes("\r\n") ? "\r\n" : "\n";
  const lines = content.split(newline);
  const originLines = lines.filter(line => /^\s*(?:export\s+)?AUTH_ORIGIN\s*=/.test(line));
  if (originLines.length > 1) throw new Error("AUTH_ORIGIN has duplicate assignments; resolve them before running this helper.");
  if (originLines.length) {
    const rawValue = originLines[0].slice(originLines[0].indexOf("=") + 1).trim();
    const match = rawValue.match(/^(?:"([^"]*)"|'([^']*)'|([^\s#]+))\s*(?:#.*)?$/);
    assertLocalUrl(match?.[1] ?? match?.[2] ?? match?.[3], 3000, "AUTH_ORIGIN");
  }
  const updated = [];
  const seen = new Set();
  for (const line of lines) {
    const name = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.[1];
    if (Object.hasOwn(validated, name)) {
      if (!seen.has(name)) updated.push(`${name}=${JSON.stringify(validated[name])}`);
      seen.add(name);
    } else {
      updated.push(line);
    }
  }
  if (updated.at(-1) === "") updated.pop();
  for (const [name, value] of Object.entries(validated)) {
    if (!seen.has(name)) updated.push(`${name}=${JSON.stringify(value)}`);
  }
  if (!originLines.length) updated.push('AUTH_ORIGIN="http://localhost:3000"');
  return updated.join(newline) + newline;
}

async function readExistingEnv(envPath) {
  try {
    const metadata = await lstat(envPath);
    if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error("Environment path must be a regular file, not a symlink.");
    return await readFile(envPath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return undefined;
    throw error;
  }
}

export async function populateLocalEnv({ envPath = path.join(websiteDirectory, ".env.local"), readStatus = readLocalStatus, request = fetch } = {}) {
  const values = await readStatus();
  const validated = validateLocalStatus({ API_URL: values.SUPABASE_URL, PUBLISHABLE_KEY: values.SUPABASE_PUBLISHABLE_KEY });
  try {
    const response = await request(`${validated.SUPABASE_URL}/auth/v1/health`, {
      headers: { apikey: validated.SUPABASE_PUBLISHABLE_KEY },
      signal: AbortSignal.timeout(5_000),
      redirect: "error",
    });
    if (!response.ok) throw new Error("unhealthy");
  } catch {
    throw new Error("Local Supabase Auth is unavailable; no environment values were written.");
  }
  const original = await readExistingEnv(envPath);
  const updated = updateEnvContent(original ?? "", validated);
  const temporaryPath = `${envPath}.${randomUUID()}.tmp`;
  let temporaryFile;
  try {
    temporaryFile = await open(temporaryPath, "wx", 0o600);
    await temporaryFile.writeFile(updated, "utf8");
    await temporaryFile.sync();
    await temporaryFile.close();
    temporaryFile = undefined;
    if (await readExistingEnv(envPath) !== original) throw new Error("Environment changed while generating values; retry without concurrent edits.");
    await rename(temporaryPath, envPath);
  } finally {
    await temporaryFile?.close();
    await unlink(temporaryPath).catch(error => { if (error.code !== "ENOENT") throw error; });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) {
    console.error("This helper accepts no remote project, URL, or credential arguments.");
    process.exitCode = 1;
  } else {
    try {
      await populateLocalEnv();
      console.log("Updated website/.env.local with local unprivileged Supabase configuration. No credentials printed.");
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
