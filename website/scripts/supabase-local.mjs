import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readLocalStatus, runLocalSupabase } from "./supabase-local-env.mjs";

const executeFile = promisify(execFile);
const networkName = "taxtrax-supabase-local";

async function ensureLoopbackNetwork() {
  try {
    await executeFile("docker", ["info", "--format", "{{.ServerVersion}}"], { timeout: 15_000 });
    let network;
    try {
      const result = await executeFile("docker", ["network", "inspect", networkName], { timeout: 15_000 });
      network = JSON.parse(result.stdout)[0];
    } catch {
      await executeFile("docker", ["network", "create", "--driver", "bridge", "--opt", "com.docker.network.bridge.host_binding_ipv4=127.0.0.1", networkName], { timeout: 15_000 });
      const result = await executeFile("docker", ["network", "inspect", networkName], { timeout: 15_000 });
      network = JSON.parse(result.stdout)[0];
    }
    if (network.Driver !== "bridge" || network.Options?.["com.docker.network.bridge.host_binding_ipv4"] !== "127.0.0.1") {
      throw new Error("unsafe network");
    }
  } catch {
    throw new Error("A running Docker-compatible daemon and a loopback-only taxtrax-supabase-local bridge network are required. Check Docker permissions and network configuration.");
  }
}

async function printStatus() {
  const values = await readLocalStatus();
  console.log(`Local Supabase API: ${values.SUPABASE_URL}`);
  console.log("Studio: http://127.0.0.1:55323; captured email: http://127.0.0.1:55324");
  console.log("Credentials suppressed. Use npm run supabase:env to populate the website's unprivileged configuration.");
}

try {
  const [command, ...argumentsList] = process.argv.slice(2);
  if (!["start", "stop", "status", "reset"].includes(command) || (command !== "reset" && argumentsList.length)) {
    throw new Error("Use start, stop, status, or reset. Remote-project arguments are not accepted.");
  }
  if (command === "start") {
    await ensureLoopbackNetwork();
    console.log("Starting the local stack; first-run Docker image downloads may take several minutes. CLI credentials are suppressed.");
    await runLocalSupabase(["start", "--network-id", networkName], 30 * 60_000);
    await printStatus();
  } else if (command === "stop") {
    await runLocalSupabase(["stop"], 5 * 60_000);
    console.log("Stopped this repository's local Supabase project, retaining its local database volume.");
  } else if (command === "status") {
    await printStatus();
  } else {
    if (argumentsList.length !== 1 || argumentsList[0] !== "--confirm-local-reset") {
      throw new Error("Reset deletes this project's local Supabase data only. To confirm, run npm run supabase:reset -- --confirm-local-reset. SQLite is not affected.");
    }
    await ensureLoopbackNetwork();
    await readLocalStatus();
    await runLocalSupabase(["db", "reset", "--local", "--no-seed", "--network-id", networkName], 10 * 60_000);
    console.log("Reset only this repository's local Supabase database using repository migrations; SQL seeding is disabled.");
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
