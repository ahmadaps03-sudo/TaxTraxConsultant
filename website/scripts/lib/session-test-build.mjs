import { execFile, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import typescript from "typescript";

const executeFile = promisify(execFile);
const website = fileURLToPath(new URL("../../", import.meta.url));
const files = ["middleware.ts", "lib/auth/current.ts", "lib/auth/authorize.ts", "lib/supabase/config.ts", "lib/supabase/cookies.ts", "lib/supabase/cache.ts", "lib/supabase/client.ts", "lib/supabase/server.ts", "lib/supabase/middleware.ts"];

export async function sessionTestBuild(additionalFiles = [], { realPortal = false } = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "taxtrax-session-tests-"));
  const compiled = path.join(directory, "compiled");
  const harness = path.join(directory, "harness");
  await mkdir(compiled);
  await mkdir(harness);
  for (const [filename, functionName] of [["lib/access-requests/handler.ts", "submit-access-request"], ["lib/admin/access-requests.ts", "review-access-requests"]]) {
    if (!additionalFiles.includes(filename)) continue;
    const moduleDirectory = path.join(directory, "supabase", "functions", functionName);
    await mkdir(moduleDirectory, { recursive: true });
    const moduleSource = await readFile(path.join(website, "..", "supabase", "functions", functionName, "core.mjs"), "utf8");
    await writeFile(path.join(moduleDirectory, "core.mjs"), moduleSource);
    await writeFile(path.join(moduleDirectory, "core.cjs"), typescript.transpileModule(moduleSource, { compilerOptions: { target: typescript.ScriptTarget.ES2022, module: typescript.ModuleKind.CommonJS } }).outputText);
  }
  for (const target of [compiled, harness]) {
    await symlink(path.join(website, "node_modules"), path.join(target, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  }
  for (const filename of new Set([...files, ...additionalFiles, ...(additionalFiles.includes("lib/auth/activation.ts") ? ["lib/auth/welcome.ts"] : []), ...(realPortal ? ["components/portal/CreateAccountForm.tsx"] : [])])) {
    const source = await readFile(path.join(website, filename), "utf8");
    const output = typescript.transpileModule(source, { fileName: filename, compilerOptions: { target: typescript.ScriptTarget.ES2022, module: typescript.ModuleKind.CommonJS, jsx: typescript.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText.replace('require("server-only");', "").replace(/(submit-access-request|review-access-requests)\/core\.mjs/g, "$1/core.cjs");
    const compiledPath = path.join(compiled, filename.replace(/\.tsx?$/, ".js"));
    const harnessPath = path.join(harness, filename);
    await mkdir(path.dirname(compiledPath), { recursive: true });
    await mkdir(path.dirname(harnessPath), { recursive: true });
    await writeFile(compiledPath, output);
    await writeFile(harnessPath, source);
  }
  await writeFile(path.join(compiled, "package.json"), '{"type":"commonjs"}');
  await writeFile(path.join(harness, "package.json"), JSON.stringify({ private: true, dependencies: { next: "14.2.35", react: "18.3.1", "react-dom": "18.3.1" } }));
  await writeFile(path.join(harness, "next.config.js"), await readFile(path.join(website, "next.config.js")));
  await writeFile(path.join(harness, "tsconfig.json"), await readFile(path.join(website, "tsconfig.json")));
  await mkdir(path.join(harness, "app", "portal"), { recursive: true });
  await mkdir(path.join(harness, "app", "outside"), { recursive: true });
  await writeFile(path.join(harness, "app", "layout.tsx"), `${realPortal ? 'import "./globals.css"; ' : ''}export default function Layout({children}: {children: React.ReactNode}) {return <html><body><main id="main">{children}</main></body></html>}`);
  if (!realPortal) await writeFile(path.join(harness, "app", "portal", "page.tsx"), 'import {getCurrentUserResult} from "../../lib/auth/current"; export default async function Page() {const result = await getCurrentUserResult(); const safe = result.status === "authorized" ? {status:result.status,user:result.user} : {status:result.status}; return <pre id="identity">{JSON.stringify(safe)}</pre>}');
  if (realPortal) {
    for (const filename of ["app/globals.css", "tailwind.config.ts", "postcss.config.js"]) await writeFile(path.join(harness, filename), await readFile(path.join(website, filename)));
  }
  await writeFile(path.join(harness, "app", "outside", "page.tsx"), 'export default function Page() {return <main>Outside the portal</main>}');
  const require = createRequire(path.join(compiled, "package.json"));
  let child;
  let diagnostics = "";
  return {
    require: filename => require(path.join(compiled, filename)),
    directory,
    logsContain: values => values.some(value => value && diagnostics.includes(value)),
    async start(environment, { authOrigin = false } = {}) {
      const net = await import("node:net");
      const listener = net.createServer();
      await new Promise(resolve => listener.listen(0, "127.0.0.1", resolve));
      const port = listener.address().port;
      await new Promise(resolve => listener.close(resolve));
      const origin = `http://127.0.0.1:${port}`;
      const runtimeEnvironment = { ...process.env, ...environment, ...(authOrigin ? { AUTH_ORIGIN: origin } : {}), NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1" };
      try {
        await executeFile(process.execPath, [path.join(website, "node_modules/next/dist/bin/next"), "build"], { cwd: harness, env: runtimeEnvironment, timeout: 120_000, maxBuffer: 8 * 1024 * 1024 });
      } catch {
        throw new Error("Isolated Next.js production session harness failed to build.");
      }
      child = spawn(process.execPath, [path.join(website, "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: harness, env: runtimeEnvironment, stdio: ["ignore", "pipe", "pipe"] });
      for (const stream of [child.stdout, child.stderr]) stream.on("data", data => { diagnostics = (diagnostics + data.toString()).slice(-65_536); });
      for (let attempt = 0; attempt < 120; attempt++) {
        if (child.exitCode !== null) throw new Error("Isolated Next.js session harness failed to start.");
        try {
          const response = await fetch(`${origin}/outside`, { signal: AbortSignal.timeout(5_000) });
          if (response.ok) return origin;
        } catch {}
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      throw new Error("Isolated Next.js session harness startup timed out.");
    },
    async stop() {
      if (child && child.exitCode === null) {
        const exited = new Promise(resolve => child.once("exit", resolve));
        child.kill("SIGTERM");
        await exited;
      }
      await rm(directory, { recursive: true, force: true });
    },
  };
}
