import { localFixtureContext, provisionFixtures } from "./lib/supabase-fixtures.mjs";

try {
  if (process.argv.length !== 2) throw new Error("Local provisioning accepts no remote URL, credential, or target arguments.");
  const context = await localFixtureContext();
  const fixtures = await provisionFixtures(context);
  for (const [key, fixture] of Object.entries(fixtures)) {
    console.log(`${key}: ${fixture.profile?.status ?? "no profile"}; ${fixture.created ? "created" : "existing identity preserved"}`);
  }
  console.log("Synthetic local fixtures ready. Passwords/emails are documented in docs/client-profile-authorization.md. No credentials or session tokens printed.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
