import { createClient } from "@supabase/supabase-js";
import { runLocalSupabase, validateLocalStatus } from "../supabase-local-env.mjs";

export const fixturePassword = "TaxTrax-synthetic-local-only-2026!";
const fixtureMarker = "taxtrax-client-auth-local-v1";
const clientOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const definitions = [
  { key: "active-a", name: "Synthetic Client A", status: "active", confirmed: true },
  { key: "active-b", name: "Synthetic Client B", status: "active", confirmed: true },
  { key: "pending", name: "Synthetic Pending Client", status: "pending", confirmed: true },
  { key: "suspended", name: "Synthetic Suspended Client", status: "suspended", confirmed: true },
  { key: "no-profile", confirmed: true },
  { key: "unconfirmed", confirmed: false },
];

export async function localFixtureContext() {
  const status = JSON.parse(await runLocalSupabase(["status", "--output", "json"]));
  const values = validateLocalStatus(status);
  const privilegedKey = status.SECRET_KEY || status.SERVICE_ROLE_KEY;
  let validLegacy = false;
  try {
    validLegacy = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(privilegedKey) && JSON.parse(Buffer.from(privilegedKey.split(".")[1], "base64url")).role === "service_role";
  } catch {
    validLegacy = false;
  }
  if (typeof privilegedKey !== "string" || (!/^sb_secret_[A-Za-z0-9_-]+$/.test(privilegedKey) && !validLegacy)) {
    throw new Error("Local CLI status did not provide a provisioning credential.");
  }
  const response = await fetch(`${values.SUPABASE_URL}/auth/v1/health`, {
    headers: { apikey: values.SUPABASE_PUBLISHABLE_KEY },
    signal: AbortSignal.timeout(5_000),
    redirect: "error",
  });
  if (!response.ok) throw new Error("The local Auth service is unavailable.");
  const options = {
    ...clientOptions,
    global: { fetch: (input, settings) => {
      const target = new URL(typeof input === "string" ? input : input.url ?? input.href);
      if (target.origin !== values.SUPABASE_URL) throw new Error("Fixture requests cannot target a remote origin.");
      return fetch(input, { ...settings, redirect: "error", signal: settings?.signal ?? AbortSignal.timeout(15_000) });
    } },
  };
  return {
    url: values.SUPABASE_URL,
    publishableKey: values.SUPABASE_PUBLISHABLE_KEY,
    admin: createClient(values.SUPABASE_URL, privilegedKey, options),
    client: () => createClient(values.SUPABASE_URL, values.SUPABASE_PUBLISHABLE_KEY, options),
  };
}

async function findFixtureUser(context, email) {
  for (let page = 1; ; page++) {
    const result = await context.admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (result.error) throw new Error("Could not enumerate local fixture identities.");
    const found = result.data.users.find(user => user.email === email);
    if (found) return found;
    if (result.data.users.length < 1000) return undefined;
  }
}

export async function provisionFixtures(context, namespace = "development") {
  validateLocalStatus({ API_URL: context.url, PUBLISHABLE_KEY: context.publishableKey });
  if (namespace !== "development" && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(namespace)) {
    throw new Error("Only the fixed development fixtures or isolated synthetic test namespaces are supported.");
  }
  const fixtures = {};
  for (const definition of definitions) {
    const email = `${definition.key}.${namespace}@taxtrax.example.invalid`;
    let user = await findFixtureUser(context, email);
    let created = false;
    if (user && (user.app_metadata?.taxtrax_local_fixture !== fixtureMarker || user.app_metadata?.fixture_namespace !== namespace || user.app_metadata?.fixture_key !== definition.key)) {
      throw new Error("Fixture email collision with an unmanaged local identity; no changes made to that identity.");
    }
    if (!user) {
      const result = await context.admin.auth.admin.createUser({
        email,
        password: fixturePassword,
        email_confirm: definition.confirmed,
        app_metadata: { taxtrax_local_fixture: fixtureMarker, fixture_namespace: namespace, fixture_key: definition.key },
      });
      if (result.error || !result.data.user) throw new Error("Could not create a synthetic local identity.");
      user = result.data.user;
      created = true;
    }
    try {
      const existing = await context.admin.from("client_profiles").select("user_id,name,status").eq("user_id", user.id).maybeSingle();
      if (existing.error) throw new Error("Could not inspect the synthetic profile.");
      if (!definition.status && existing.data) throw new Error("A no-profile fixture already has a profile; refusing to delete or overwrite it.");
      let profile = existing.data;
      if (definition.status && !profile) {
        const inserted = await context.admin.from("client_profiles").insert({ user_id: user.id, name: definition.name, status: "pending" }).select("user_id,name,status").single();
        if (inserted.error) throw new Error("Could not create the synthetic profile.");
        profile = inserted.data;
        if (created && definition.status !== "pending") {
          const approved = await context.admin.from("client_profiles").update({ status: definition.status }).eq("user_id", user.id).select("user_id,name,status").single();
          if (approved.error) throw new Error("Could not finalize the synthetic profile status.");
          profile = approved.data;
        }
      }
      fixtures[definition.key] = { id: user.id, email, profile, created };
    } catch {
      if (created) {
        const result = await context.admin.auth.admin.deleteUser(user.id);
        if (result.error) throw new Error("Provisioning failed and newly created identity cleanup failed; inspect the local synthetic fixtures before continuing.");
      }
      throw new Error("Synthetic provisioning failed; existing approval states were not changed and newly created identities were removed.");
    }
  }
  return fixtures;
}

export async function removeTestFixtures(context, namespace) {
  validateLocalStatus({ API_URL: context.url, PUBLISHABLE_KEY: context.publishableKey });
  if (!/^[0-9a-f-]{36}$/.test(namespace)) throw new Error("Cleanup is restricted to isolated synthetic test namespaces.");
  let failed = false;
  for (const definition of definitions) {
    const user = await findFixtureUser(context, `${definition.key}.${namespace}@taxtrax.example.invalid`);
    if (!user) continue;
    if (user.app_metadata?.taxtrax_local_fixture !== fixtureMarker || user.app_metadata?.fixture_namespace !== namespace) {
      failed = true;
      continue;
    }
    const result = await context.admin.auth.admin.deleteUser(user.id);
    if (result.error) failed = true;
  }
  if (failed) throw new Error("Synthetic test fixture cleanup failed; inspect local fixtures. No other identities were deleted.");
}
