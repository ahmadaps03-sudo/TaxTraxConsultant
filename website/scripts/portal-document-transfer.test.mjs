import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import typescript from "typescript";

const require = createRequire(import.meta.url);
const source = await readFile(new URL("../lib/portal/service.ts", import.meta.url), "utf8");
const compiled = typescript.transpileModule(source, { compilerOptions: {
  module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022, esModuleInterop: true,
} }).outputText;
const module = { exports: {} };
new Function("require", "module", "exports", compiled)((name) => {
  if (name === "server-only") return {};
  if (name === "../supabase/config") return { getSupabaseConfiguration: () => ({ url: "https://synthetic.supabase.co", key: "sb_publishable_synthetic" }) };
  if (name === "../site-persistence/client") return { listSiteRecordsForAdmin: async () => [] };
  return require(name);
}, module, module.exports);
const { beginDocumentUpload, completeDocumentUpload, cleanupDocumentUpload, documentFile, MAX_FILE_BYTES } = module.exports;
const client = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", email: "client@example.invalid", name: "Synthetic Client" };
const other = { ...client, id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" };
const path = `${client.id}/cccccccc-cccc-4ccc-8ccc-cccccccccccc.pdf`;
const details = { name: "Synthetic.pdf", size: 12, tag: "W-2", taxYear: 2025 };
const fakeDb = (overrides = {}) => {
  const calls = { removed: [], rpc: [] };
  const db = {
    auth: { getSession: async () => ({ data: { session: { access_token: "synthetic-session" } } }) },
    storage: { from: () => ({
      createSignedUploadUrl: async objectPath => ({ data: { signedUrl: `https://synthetic.supabase.co/storage/v1/object/upload/sign/client-documents/${objectPath}?token=synthetic-upload-proof` }, error: null }),
      info: async () => ({ data: { size: 12, contentType: "application/pdf" }, error: null }),
      remove: async paths => { calls.removed.push(...paths); return { error: null }; },
      createSignedUrl: async () => ({ data: { signedUrl: `https://synthetic.supabase.co/storage/v1/object/sign/client-documents/${path}?token=synthetic-download-proof` }, error: null }),
      ...overrides.storage,
    }) },
    rpc: async (name, args) => { calls.rpc.push({ name, args }); return { data: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", error: null }; },
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { storage_path: path, file_name: details.name }, error: null }) }) }) }) }),
    ...overrides.db,
  };
  return { db, calls };
};

test("upload permission is user-scoped, bounded and contains no privileged key", async () => {
  const { db } = fakeDb();
  const started = await beginDocumentUpload(db, client, details);
  assert.match(started.path, new RegExp(`^${client.id}/[0-9a-f-]{36}\\.pdf$`));
  assert.equal(new URL(started.uploadUrl).origin, "https://synthetic.supabase.co");
  assert.equal(started.contentType, "application/pdf");
  assert.ok(!JSON.stringify(started).includes("service_role"));
  await assert.rejects(beginDocumentUpload(db, client, { ...details, size: MAX_FILE_BYTES + 1 }), { status: 413 });
  await assert.rejects(beginDocumentUpload(db, client, { ...details, name: "bad.exe" }), { status: 415 });
  await assert.rejects(beginDocumentUpload(db, client, { ...details, userId: other.id }), { status: 400 });
});

test("completion checks Storage metadata and file signature before attaching", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.headers.Range, "bytes=0-8191");
    return new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]));
  };
  try {
    const { db, calls } = fakeDb();
    const result = await completeDocumentUpload(db, client, { ...details, path });
    assert.equal(typeof result.id, "string");
    assert.equal(calls.rpc[0].name, "portal_add_document");
    assert.equal(calls.rpc[0].args.p_path, path);
    assert.deepEqual(calls.removed, []);
    await assert.rejects(completeDocumentUpload(db, other, { ...details, path }), { status: 400 });
    const mismatched = fakeDb({ storage: { info: async () => ({ data: { size: 13, contentType: "application/pdf" }, error: null }) } });
    await assert.rejects(completeDocumentUpload(mismatched.db, client, { ...details, path }), { status: 400 });
    assert.deepEqual(mismatched.calls.removed, [path]);
    globalThis.fetch = async () => new Response(new Uint8Array([0, 1, 2, 3]));
    const invalid = fakeDb();
    await assert.rejects(completeDocumentUpload(invalid.db, client, { ...details, path }), { status: 415 });
    assert.deepEqual(invalid.calls.removed, [path]);
  } finally { globalThis.fetch = previous; }
});

test("download is an owned short-lived signed redirect, not a proxied file", async () => {
  const { db } = fakeDb();
  const url = await documentFile(db, client, "dddddddd-dddd-4ddd-8ddd-dddddddddddd");
  assert.equal(new URL(url).origin, "https://synthetic.supabase.co");
  await assert.rejects(cleanupDocumentUpload(db, other, path), { status: 400 });
  const route = await readFile(new URL("../app/api/client/documents/[id]/route.ts", import.meta.url), "utf8");
  assert.match(route, /status: 303/);
  assert.doesNotMatch(route, /Content-Length|f\.stream/);
  const uploadRoute = await readFile(new URL("../app/api/client/documents/route.ts", import.meta.url), "utf8");
  assert.match(uploadRoute, /jsonBody\(request\)/);
  assert.doesNotMatch(uploadRoute, /arrayBuffer\(|formData\(/);
});
