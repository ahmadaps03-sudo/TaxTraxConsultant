import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { portalAdmin, portalInput } from "../../supabase/functions/portal-admin/core.mjs";
import { portalProvider } from "../../supabase/functions/portal-admin/provider.mjs";

const bodySource = (await readFile(new URL("../lib/portal/body.ts", import.meta.url), "utf8")).replace('import "server-only";', "");
const javascript = ts.transpileModule(bodySource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { boundedBody, boundedJson } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);
const originSource = (await readFile(new URL("../lib/portal/origin.ts", import.meta.url), "utf8")).replace('import "server-only";', "");
const originJavascript = ts.transpileModule(originSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { portalMutationBoundary } = await import(`data:text/javascript;base64,${Buffer.from(originJavascript).toString("base64")}`);
const origin = "http://localhost:3000";
const jsonRequest = (body, headers = {}) => new Request(`${origin}/api/client/profile`, {
  method: "POST", headers: { "Content-Type": "application/json", ...headers }, body,
});

test("bounded JSON rejects oversized declared and streaming bodies before parsing", async () => {
  await assert.rejects(boundedJson(jsonRequest("not-json", { "Content-Length": "99999" }), 10), { status: 413 });
  await assert.rejects(boundedJson(jsonRequest("not-json-with-long-content"), 10), { status: 413 });
  await assert.rejects(boundedJson(jsonRequest("{"), 20), { status: 400 });
  await assert.rejects(boundedJson(jsonRequest("{}", { "Content-Type": "text/plain" }), 20), { status: 415 });
  assert.deepEqual(await boundedJson(jsonRequest('{"phone":"synthetic"}'), 100), { phone: "synthetic" });
});

test("bounded multipart input stops at the byte limit", async () => {
  const request = new Request(`${origin}/api/client/documents`, { method: "POST", body: "synthetic-file-content" });
  await assert.rejects(boundedBody(request, 5), { status: 413 });
});

test("mutation boundary requires exact approved origin, header and same-site metadata", () => {
  const request = headers => new Request(`${origin}/api/client/profile`, { method: "PUT", headers: { Origin: origin, "X-TaxTrax-Auth": "1", ...headers } });
  assert.equal(portalMutationBoundary(request({}), origin), "allowed");
  for (const candidate of ["http://localhost:3001", "https://localhost:3000", "http://127.0.0.1:3000", "null"]) {
    assert.equal(portalMutationBoundary(request({ Origin: candidate }), origin), "denied");
  }
  for (const headers of [{ Origin: "" }, { "X-TaxTrax-Auth": "0" }, { "Sec-Fetch-Site": "cross-site" }, { "Sec-Fetch-Mode": "navigate" }, { "Sec-Fetch-Dest": "document" }]) {
    assert.equal(portalMutationBoundary(request(headers), origin), "denied");
  }
  assert.equal(portalMutationBoundary(request({}), undefined), "unavailable");
});

test("staff Edge input has an action allowlist and exact outer shape", () => {
  assert.deepEqual(portalInput({ action: "snapshot", payload: {} }), { action: "snapshot", payload: {} });
  assert.throws(() => portalInput({ action: "unknown" }));
  assert.throws(() => portalInput({ action: "snapshot", privileged: true }));
});

test("staff Edge rejects missing or wrong bearer secret without invoking provider", async () => {
  const secret = "S".repeat(48);
  let calls = 0;
  const provider = { rpc: async () => { calls++; return { code: "ok", data: [] }; } };
  for (const supplied of [undefined, "W".repeat(48)]) {
    const request = new Request(`${origin}/`, { method: "POST", headers: { "Content-Type": "application/json", ...(supplied ? { Authorization: `Bearer ${supplied}` } : {}) }, body: JSON.stringify({ action: "snapshot" }) });
    assert.equal((await portalAdmin(request, secret, provider)).status, 403);
  }
  assert.equal(calls, 0);
});

test("staff provider refuses non-Supabase targets before using its privileged key", async () => {
  let called = false;
  const provider = portalProvider("https://unapproved.example.invalid", "synthetic-secret", async () => { called = true; throw new Error(); });
  await assert.rejects(provider.rpc("snapshot", {}));
  assert.equal(called, false);
});

test("integrated portal retains server authorization and removes mock Messages navigation", async () => {
  const [page, shell, guard, service, correction] = await Promise.all([
    "app/portal/page.tsx", "components/portal/PortalClient.tsx", "lib/portal/guard.ts", "lib/portal/service.ts", "../supabase/migrations/20261012000100_client_portal_security.sql",
  ].map(path => readFile(new URL(`../${path}`, import.meta.url), "utf8")));
  assert.match(page, /getCurrentUserResult\(/);
  assert.match(shell, /<PortalTabs active=\{active\}/);
  assert.doesNotMatch(shell, /Messages/);
  assert.match(guard, /authorizePortalClient\(/);
  assert.match(guard, /portalMutationBoundary\(/);
  assert.doesNotMatch(service, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(correction, /revoke all on function public\.portal_sign\(uuid, text, boolean, text, text\)/);
  assert.match(correction, /stored_size::bigint <> p_size/);
  assert.match(correction, /alter policy client_documents_owner_insert/);
  assert.match(correction, /alter policy client_documents_owner_delete/);
  assert.match(correction, /not exists \(select 1 from public\.client_documents as doc where doc\.storage_path = name\)/);
});
