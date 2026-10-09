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

export function welcomeEnvironment(content, secret) {
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(secret)) throw new Error("Invalid welcome capability.");
  const lines = content.split(/\r?\n/);
  const assignment = name => lines.filter(line => new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=`).test(line));
  const value = line => line?.slice(line.indexOf("=") + 1).trim().replace(/^['"]|['"]$/g, "");
  if (assignment("SUPABASE_URL").length !== 1 || value(assignment("SUPABASE_URL")[0]) !== devUrl
    || assignment("WELCOME_EMAIL_SECRET").length > 1
    || secret === value(assignment("ADMIN_ACCESS_REQUEST_SECRET")[0])
    || secret === value(assignment("ACCESS_REQUEST_SUBMISSION_SECRET")[0])) throw new Error("Dev welcome configuration unavailable.");
  const remaining = lines.filter(line => !/^\s*(?:export\s+)?WELCOME_EMAIL_SECRET\s*=/.test(line));
  while (remaining.at(-1) === "") remaining.pop();
  return [...remaining, `WELCOME_EMAIL_SECRET=${JSON.stringify(secret)}`, ""].join(content.includes("\r\n") ? "\r\n" : "\n");
}

export async function setupWelcomeEmail() {
  requireDevTarget((await readFile(path.join(repository, "supabase", ".temp", "project-ref"), "utf8")).trim());
  const filename = path.join(website, ".env.local");
  const metadata = await lstat(filename);
  if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error();
  const original = await readFile(filename, "utf8");
  const existing = original.split(/\r?\n/).find(line => /^\s*(?:export\s+)?WELCOME_EMAIL_SECRET\s*=/.test(line));
  const secret = existing?.slice(existing.indexOf("=") + 1).trim().replace(/^['"]|['"]$/g, "") || randomBytes(32).toString("base64url");
  const updated = welcomeEnvironment(original, secret);
  const directory = await mkdtemp(path.join(os.tmpdir(), "taxtrax-welcome-"));
  const temporary = path.join(website, `.env.local.welcome.${randomBytes(8).toString("hex")}.tmp`);
  try {
    const secretsFile = path.join(directory, "secret.env");
    await writeFile(secretsFile, `WELCOME_EMAIL_SECRET=${secret}\nEMAILJS_TEMPLATE_ID=template_2ov11np\nEMAILJS_INVITE_TEMPLATE_ID=template_p5rfdor\n`, { mode: 0o600 });
    const cli = path.join(website, "node_modules", "supabase", "dist", "supabase.js");
    for (const args of [["secrets", "set", "--env-file", secretsFile], ["functions", "deploy", "send-recovery-email", "--no-verify-jwt", "--use-api"]]) {
      await run(process.execPath, [cli, ...args, "--project-ref", devRef, "--workdir", repository], { timeout: 120000, maxBuffer: 2 * 1024 * 1024, windowsHide: true });
    }
    if (await readFile(filename, "utf8") !== original) throw new Error();
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
    await setupWelcomeEmail();
    console.log("Dev EmailJS template IDs and scoped welcome delivery configured. Restart Next.js; no credentials printed.");
  } catch {
    console.error("Dev welcome setup failed. Check owner Dev access/link and private environment; raw credential-bearing output suppressed.");
    process.exitCode = 1;
  }
}
