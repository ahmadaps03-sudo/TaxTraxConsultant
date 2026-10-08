import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm, lstat, rename } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { devRef, devUrl, requireDevTarget } from "./supabase-shared-dev.mjs";

const website = fileURLToPath(new URL("../", import.meta.url));
const repository = path.resolve(website, "..");
const run = promisify(execFile);

export function accessRequestEnvironment(content, secret) {
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(secret)) throw new Error("Invalid scoped submission secret.");
  const lines = content.split(/\r?\n/);
  const assignments = lines.filter(line => /^\s*(?:export\s+)?ACCESS_REQUEST_SUBMISSION_SECRET\s*=/.test(line));
  if (assignments.length > 1) throw new Error("Resolve duplicate submission-secret assignments privately.");
  const urls = lines.filter(line => /^\s*(?:export\s+)?SUPABASE_URL\s*=/.test(line));
  if (urls.length !== 1) throw new Error("Configure one approved shared Dev URL.");
  const urlLine = urls[0];
  const target = urlLine?.slice(urlLine.indexOf("=") + 1).trim().replace(/^['"]|['"]$/g, "");
  if (target !== devUrl) throw new Error("Configure the approved shared Dev URL first.");
  const result = lines.filter(line => !/^\s*(?:export\s+)?ACCESS_REQUEST_SUBMISSION_SECRET\s*=/.test(line));
  while (result.at(-1) === "") result.pop();
  return [...result, `ACCESS_REQUEST_SUBMISSION_SECRET=${JSON.stringify(secret)}`, ""].join(content.includes("\r\n") ? "\r\n" : "\n");
}

export async function setupAccessRequests() {
  requireDevTarget((await readFile(path.join(repository, "supabase", ".temp", "project-ref"), "utf8")).trim());
  const filename = path.join(website, ".env.local");
  const metadata = await lstat(filename);
  if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error("Use a regular untracked .env.local file.");
  const original = await readFile(filename, "utf8");
  const assignment = original.split(/\r?\n/).find(line => /^\s*(?:export\s+)?ACCESS_REQUEST_SUBMISSION_SECRET\s*=/.test(line));
  const existing = assignment?.slice(assignment.indexOf("=") + 1).trim().replace(/^['"]|['"]$/g, "");
  const secret = existing || randomBytes(32).toString("base64url");
  const updated = accessRequestEnvironment(original, secret);
  const directory = await mkdtemp(path.join(os.tmpdir(), "taxtrax-access-setup-"));
  const temporary = path.join(website, `.env.local.access-request.${randomBytes(8).toString("hex")}.tmp`);
  try {
    const secretsFile = path.join(directory, "secret.env");
    await writeFile(secretsFile, `ACCESS_REQUEST_SUBMISSION_SECRET=${secret}\n`, { mode: 0o600 });
    const cli = path.join(website, "node_modules", "supabase", "dist", "supabase.js");
    for (const args of [
      ["secrets", "set", "--env-file", secretsFile],
      ["functions", "deploy", "submit-access-request", "--no-verify-jwt", "--use-api"],
    ]) await run(process.execPath, [cli, ...args, "--project-ref", devRef, "--workdir", repository], { timeout: 120000, maxBuffer: 2 * 1024 * 1024, windowsHide: true });
    if (await readFile(filename, "utf8") !== original) throw new Error("Environment changed concurrently; no local file replaced.");
    await writeFile(temporary, updated, { flag: "wx", mode: 0o600 });
    await rename(temporary, filename);
  } finally {
    await rm(directory, { recursive: true, force: true });
    await rm(temporary, { force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) throw new Error();
    await setupAccessRequests();
    console.log("Scoped access-request secret configured and only the Dev submission function deployed. Restart Next.js; no secret values printed.");
  } catch {
    console.error("Dev access-request setup failed. Check owner access/link and environment privately. Raw credential-bearing output suppressed.");
    process.exitCode = 1;
  }
}
