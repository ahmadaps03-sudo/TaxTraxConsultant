import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

export function redactRecoveryLog(line) {
  return line.replace(/(\/api\/auth\/recovery\/callback)\?[^\s]*/gi, "$1?[redacted]")
    .replace(/(token_hash=)[^&\s]*/gi, "$1[redacted]");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const child = spawn(process.execPath, [fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url)), "dev", ...process.argv.slice(2)], { stdio: ["inherit", "pipe", "pipe"] });
  for (const [stream, output] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
    const lines = createInterface({ input: stream });
    lines.on("line", line => output.write(redactRecoveryLog(line) + "\n"));
  }
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
  child.on("error", () => { console.error("Development server could not start."); process.exitCode = 1; });
  child.on("exit", code => { process.exitCode = code ?? 0; });
}
