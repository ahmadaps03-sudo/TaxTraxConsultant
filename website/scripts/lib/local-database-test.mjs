import { execFile } from "node:child_process";
export async function databaseTestQuery(sql) {
  const child = execFile("docker", ["exec", "-i", "supabase_db_taxtrax-client-auth", "psql", "-X", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], { maxBuffer: 1024 * 1024, timeout: 30_000 });
  child.stdin.end(sql);
  return new Promise((resolve, reject) => {
    let output = "";
    let diagnostic = "";
    child.stdout.on("data", data => { output += data; });
    child.stderr.on("data", data => { diagnostic += data; });
    child.on("error", () => reject(new Error("Local database test execution failed.")));
    child.on("close", code => {
      if (code !== 0) reject(new Error(`Local database test failed: ${diagnostic.replace(/DETAIL:[^\n]*/g, "DETAIL: suppressed")}`));
      else resolve(output);
    });
  });
}

export async function withAuthenticatedClaims(claims, statement) {
  const serialized = JSON.stringify(claims).replaceAll("'", "''");
  const output = await databaseTestQuery(`begin; select set_config('request.jwt.claims', '${serialized}', true); set local role authenticated; ${statement}; rollback;`);
  return output.trim().split("\n").at(-2);
}
