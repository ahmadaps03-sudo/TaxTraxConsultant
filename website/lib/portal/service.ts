import "server-only";
import path from "path";
import { randomUUID } from "crypto";
import type { RequestSupabaseClient } from "../supabase/client";
import { getSupabaseConfiguration } from "../supabase/config";
import { listSiteRecordsForAdmin, SitePersistenceUnavailable } from "../site-persistence/client";

/**
 * Client Portal data layer on SUPABASE (same project/architecture as login):
 *  - READS use the signed-in client's own session, so Postgres row-level security decides what comes back
 *    (an ACTIVE client with a LIVE session sees only its own rows).
 *  - WRITES call narrow SECURITY DEFINER functions (portal_*) that re-check identity, state and ownership in SQL.
 *  - FILES live in the private `client-documents` Storage bucket at  <user id>/<uuid>.<ext>  (Storage RLS too).
 * The web app only ever holds the publishable key; no service-role key is used or needed here.
 * Schema: supabase/migrations/20261011000100_client_portal.sql (+ _admin, _storage).
 */

export class PortalError extends Error {
  constructor(public status: number, message: string, public fields?: Record<string, string>) { super(message); this.name = "PortalError"; }
}

export type Client = { id: string; email: string; name: string };
export type Db = RequestSupabaseClient["client"];

export const MAX_FILE_BYTES = 25 * 1024 * 1024; // keep in sync with the bucket limit in the storage migration
export const DOC_TAGS = ["W-2", "1099", "Salary Certificate", "Bank Statement", "Expense Receipt", "Wealth Statement", "ID / CNIC", "Other"] as const;
export const PAYMENT_METHODS = ["Bank transfer", "JazzCash", "Easypaisa", "Cash at office", "Other"] as const;
export const TAX_STAGES = ["Collecting documents", "Preparing return", "Awaiting your review", "Filed", "Completed"] as const;
export const CHECKLIST_STATUSES = ["Pending", "Needs Action", "Completed"] as const;
export const DOC_STATUSES = ["Received", "Reviewed", "Needs Attention"] as const;
const BUCKET = "client-documents";

/* ---------- helpers ---------- */
const thisYear = () => new Date().getFullYear();
const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max) : "");
const int = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : typeof v === "string" && /^-?\d+$/.test(v.trim()) ? parseInt(v, 10) : NaN);
const validYear = (y: number) => Number.isInteger(y) && y >= 2000 && y <= thisYear() + 1;
/** Money is entered in major units (e.g. 4999.50) and stored as integer minor units. */
export const toMinor = (v: unknown) => { const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/,/g, "")) : NaN; return Number.isFinite(n) ? Math.round(n * 100) : NaN; };

type PgError = { code?: string; message?: string; details?: string } | null;
/** Maps the SQLSTATEs used by the portal_* functions (see migration) to HTTP errors. Unknown errors never leak details. */
function fail(error: NonNullable<PgError>): never {
  switch (error.code) {
    case "42501": throw new PortalError(401, "Please log in again.");
    case "22023": throw new PortalError(400, "Please check the values you entered.");
    case "23514": throw new PortalError(400, "One of the values is not allowed.");
    case "P0002": throw new PortalError(404, "Not found.");
    case "55000": throw new PortalError(409, "That action is not available right now.");
    case "23505": throw new PortalError(409, "That already exists.");
    case "54000": throw new PortalError(429, "Too many requests. Please try again later.");
  }
  if (error.code?.startsWith("PGRST2") || error.code === "42883" || error.code === "42P01") {
    console.error("[portal] schema_unavailable");
    throw new PortalError(503, "The portal is not fully set up yet. Please contact us.");
  }
  console.error("[portal] database_failure");
  throw new PortalError(500, "Something went wrong. Please try again.");
}
async function rpc<T = unknown>(db: Db, fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args ?? {});
  if (error) fail(error);
  return data as T;
}
function must<T>(result: { data: T | null; error: PgError }): T {
  if (result.error) fail(result.error);
  return result.data as T;
}

/* ---------- billing maths (shared with the admin view) ---------- */
type InvoiceRow = { id: string; number: string; description: string; tax_year: number | null; amount_minor: number; currency: string; status: string; issued_at: string; due_at: string | null; paid_at: string | null };
type PaymentRow = { id: string; invoice_id: string; amount_minor: number; method: string; reference: string; status: string; created_at: string };

export function buildBilling(invoiceRows: InvoiceRow[], paymentRows: PaymentRow[]) {
  const today = new Date().toISOString().slice(0, 10);
  const invoices = invoiceRows.map((i) => {
    const mine = paymentRows.filter((p) => p.invoice_id === i.id);
    const paid = mine.filter((p) => p.status === "Confirmed").reduce((a, p) => a + Number(p.amount_minor), 0);
    const pending = mine.filter((p) => p.status === "Pending Review").reduce((a, p) => a + Number(p.amount_minor), 0);
    const amount = Number(i.amount_minor);
    const balance = i.status === "Void" ? 0 : Math.max(0, amount - paid);
    const status = i.status === "Open" && balance > 0 && i.due_at && i.due_at.slice(0, 10) < today ? "Overdue" : i.status;
    return { id: i.id, number: i.number, description: i.description, taxYear: i.tax_year, amount, currency: i.currency, status, issuedAt: i.issued_at, dueAt: i.due_at, paidAt: i.paid_at, paid, pending, balance };
  });
  const live = invoices.filter((i) => i.status !== "Void");
  const sum = (k: "amount" | "paid" | "pending" | "balance") => live.reduce((a, i) => a + i[k], 0);
  return {
    invoices,
    payments: paymentRows.map((p) => ({ id: p.id, invoiceId: p.invoice_id, invoiceNumber: invoices.find((i) => i.id === p.invoice_id)?.number ?? "", amount: Number(p.amount_minor), method: p.method, reference: p.reference, status: p.status, createdAt: p.created_at })),
    totals: { invoiced: sum("amount"), paid: sum("paid"), pendingReview: sum("pending"), outstanding: sum("balance"), currency: live[0]?.currency ?? "PKR" },
  };
}

/* ---------- appointments ---------- */
async function appointmentsFor(email: string) {
  try {
    const rows = await listSiteRecordsForAdmin("bookings");
    const today = new Date().toISOString().slice(0, 10);
    return rows.filter((row) => typeof row.email === "string" && row.email.toLowerCase() === email.toLowerCase())
      .filter((b): b is typeof b & { date: string; status: string } => typeof b.status === "string" && ["pending", "confirmed"].includes(b.status) && typeof b.date === "string" && b.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((b) => ({ id: String(b.id), date: b.date as string, time: String(b.time ?? ""), service: String(b.service || "Consultation"), status: b.status as string }));
  } catch (error) {
    if (error instanceof SitePersistenceUnavailable) throw new PortalError(503, "Appointments are temporarily unavailable.");
    throw error;
  }
}

/* ---------- read model: one call powers every tab ---------- */
export async function getOverview(db: Db, c: Client) {
  await rpc(db, "portal_bootstrap"); // idempotent: first call seeds the starter checklist, engagement letter and tax year
  const [profile, contact, taxRows, checkRows, docRows, signRows, invoiceRows, paymentRows, appointments] = await Promise.all([
    db.from("client_profiles").select("created_at").eq("user_id", c.id).maybeSingle(),
    db.from("client_contact_details").select("phone,company,country,address,city").eq("user_id", c.id).maybeSingle(),
    db.from("client_tax_years").select("tax_year,stage,note,filed_at,updated_at").eq("user_id", c.id).order("tax_year", { ascending: false }),
    db.from("client_checklist_items").select("id,key,label,status,tax_year,updated_at").eq("user_id", c.id).order("tax_year", { ascending: false }).order("sort"),
    db.from("client_documents").select("id,file_name,size_bytes,tag,tax_year,status,admin_note,uploaded_at").eq("user_id", c.id).order("uploaded_at", { ascending: false }),
    db.from("client_esign_requests").select("id,title,body,tax_year,status,created_at,signed_at,signed_name").eq("user_id", c.id).order("created_at", { ascending: false }),
    db.from("client_invoices").select("id,number,description,tax_year,amount_minor,currency,status,issued_at,due_at,paid_at").eq("user_id", c.id).order("issued_at", { ascending: false }),
    db.from("client_payments").select("id,invoice_id,amount_minor,method,reference,status,created_at").eq("user_id", c.id).order("created_at", { ascending: false }),
    appointmentsFor(c.email),
  ]);
  const p = must(profile as { data: { created_at: string } | null; error: PgError });
  const ct = must(contact as { data: Record<string, string> | null; error: PgError });
  type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const taxYears = (must(taxRows as { data: Row[] | null; error: PgError }) ?? []).map((t) => ({ taxYear: t.tax_year as number, stage: t.stage as string, stageIndex: Math.max(0, TAX_STAGES.indexOf(t.stage)), note: t.note as string, filedAt: t.filed_at as string | null, updatedAt: t.updated_at as string }));
  const activeYear = taxYears.find((t) => t.stage !== "Completed")?.taxYear ?? taxYears[0]?.taxYear ?? thisYear();
  const documents = (must(docRows as { data: Row[] | null; error: PgError }) ?? []).map((r) => ({ id: r.id as string, name: r.file_name as string, size: r.size_bytes as number, tag: r.tag as string, taxYear: r.tax_year as number, status: r.status as string, note: r.admin_note as string, uploadedAt: r.uploaded_at as string, canDelete: r.status === "Received" }));
  const checklist = (must(checkRows as { data: Row[] | null; error: PgError }) ?? []).map((r) => ({ id: r.id as string, label: r.label as string, status: r.status as string, taxYear: r.tax_year as number, updatedAt: r.updated_at as string, selfService: r.key === null }));
  const esign = (must(signRows as { data: Row[] | null; error: PgError }) ?? [])
    .map((r) => ({ id: r.id as string, title: r.title as string, body: r.body as string, taxYear: r.tax_year as number | null, status: r.status as string, createdAt: r.created_at as string, signedAt: r.signed_at as string | null, signedName: (r.signed_name ?? null) as string | null }))
    .sort((a, b) => Number(b.status === "Pending") - Number(a.status === "Pending") || b.createdAt.localeCompare(a.createdAt));
  const billing = buildBilling(must(invoiceRows as { data: InvoiceRow[] | null; error: PgError }) ?? [], must(paymentRows as { data: PaymentRow[] | null; error: PgError }) ?? []);
  const yearItems = checklist.filter((i) => i.taxYear === activeYear);
  return {
    profile: { name: c.name, email: c.email, phone: ct?.phone ?? "", company: ct?.company ?? "", country: ct?.country ?? "", address: ct?.address ?? "", city: ct?.city ?? "", memberSince: p?.created_at ?? null },
    activeYear, taxYears, documents, checklist, esign, appointments, billing,
    stats: {
      pendingTasks: yearItems.filter((i) => i.status !== "Completed").length,
      documentsAwaitingReview: documents.filter((x) => x.status === "Received").length,
      signaturesWaiting: esign.filter((e) => e.status === "Pending").length,
      outstanding: billing.totals.outstanding, currency: billing.totals.currency,
    },
    options: { docTags: DOC_TAGS, paymentMethods: PAYMENT_METHODS, taxStages: TAX_STAGES, maxFileBytes: MAX_FILE_BYTES },
  };
}

/* ---------- profile ---------- */
export async function saveProfile(db: Db, input: Record<string, unknown>) {
  const v = { phone: text(input.phone, 40), company: text(input.company, 100), country: text(input.country, 60), address: text(input.address, 200), city: text(input.city, 80) };
  const digits = v.phone.replace(/\D/g, "").length;
  if (v.phone && !(/^[+0-9][0-9 ().-]*$/.test(v.phone) && digits >= 7 && digits <= 15)) {
    throw new PortalError(400, "Please correct the highlighted fields.", { phone: "Enter a valid phone number, e.g. +92 300 1234567." });
  }
  await rpc(db, "portal_save_profile", { p_phone: v.phone, p_company: v.company, p_country: v.country, p_address: v.address, p_city: v.city });
  return v;
}

/* ---------- documents (Storage + metadata) ---------- */
const FILE_TYPES: Record<string, { mime: string; magic?: number[][]; text?: boolean }> = {
  pdf: { mime: "application/pdf", magic: [[0x25, 0x50, 0x44, 0x46]] },
  jpg: { mime: "image/jpeg", magic: [[0xff, 0xd8, 0xff]] }, jpeg: { mime: "image/jpeg", magic: [[0xff, 0xd8, 0xff]] },
  png: { mime: "image/png", magic: [[0x89, 0x50, 0x4e, 0x47]] },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", magic: [[0x50, 0x4b, 0x03, 0x04]] },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", magic: [[0x50, 0x4b, 0x03, 0x04]] },
  xls: { mime: "application/vnd.ms-excel", magic: [[0xd0, 0xcf, 0x11, 0xe0]] },
  doc: { mime: "application/msword", magic: [[0xd0, 0xcf, 0x11, 0xe0]] },
  csv: { mime: "text/csv", text: true },
};

/** Storage calls use the client's own access token with a longer timeout than the shared auth fetch (25 MB uploads). */
async function storage(db: Db, method: "POST" | "GET" | "DELETE", objectPath: string, init: { body?: Buffer; contentType?: string } = {}) {
  const session = (await db.auth.getSession()).data.session;
  if (!session?.access_token) throw new PortalError(401, "Please log in again.");
  const { url, key } = getSupabaseConfiguration();
  const route = method === "GET" ? "object/authenticated" : "object";
  const target = `${url}/storage/v1/${route}/${BUCKET}/${objectPath.split("/").map(encodeURIComponent).join("/")}`;
  return fetch(target, {
    method, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(120_000),
    headers: { apikey: key, Authorization: `Bearer ${session.access_token}`, ...(init.contentType ? { "Content-Type": init.contentType, "x-upsert": "false" } : {}) },
    body: init.body ? new Uint8Array(init.body) : undefined,
  });
}

export async function saveDocument(db: Db, c: Client, file: { name: string; bytes: Buffer }, tagInput: unknown, yearInput: unknown) {
  const tag = text(tagInput, 40);
  if (!(DOC_TAGS as readonly string[]).includes(tag)) throw new PortalError(400, "Choose what kind of document this is.");
  const year = int(yearInput);
  if (!validYear(year)) throw new PortalError(400, "Choose a valid tax year.");
  const ext = path.extname(file.name).slice(1).toLowerCase();
  const type = FILE_TYPES[ext];
  if (!type) throw new PortalError(415, "Only PDF, JPG, PNG, Excel (XLS/XLSX), Word (DOC/DOCX) or CSV files are allowed.");
  if (!file.bytes.length) throw new PortalError(400, "That file is empty.");
  if (file.bytes.length > MAX_FILE_BYTES) throw new PortalError(413, "That file is larger than 25 MB.");
  const okMagic = type.text ? !file.bytes.subarray(0, 8192).includes(0) : type.magic!.some((m) => m.every((b, i) => file.bytes[i] === b));
  if (!okMagic) throw new PortalError(415, `That file does not look like a real .${ext} file.`);

  const displayName = file.name.replace(/[\\/\u0000-\u001f\u007f"<>|:*?]/g, "_").replace(/^\.+/, "").slice(-120) || `document.${ext}`;
  const objectPath = `${c.id}/${randomUUID()}.${ext}`;
  const uploaded = await storage(db, "POST", objectPath, { body: file.bytes, contentType: type.mime }).catch(() => null);
  if (!uploaded || !uploaded.ok) {
    console.error("[portal] storage_upload_failed", uploaded?.status ?? "network");
    throw new PortalError(uploaded?.status === 401 || uploaded?.status === 403 ? 401 : 502, uploaded?.status === 401 || uploaded?.status === 403 ? "Please log in again." : "We couldn't store that file. Please try again.");
  }
  try {
    return { id: await rpc<string>(db, "portal_add_document", { p_path: objectPath, p_name: displayName, p_mime: type.mime, p_size: file.bytes.length, p_tag: tag, p_year: year }) };
  } catch (e) {
    await storage(db, "DELETE", objectPath).catch(() => undefined); // don't leave an unregistered file behind
    throw e;
  }
}

async function ownedDocument(db: Db, c: Client, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new PortalError(404, "Document not found.");
  const row = must(await db.from("client_documents").select("storage_path,file_name,mime,size_bytes").eq("id", id).eq("user_id", c.id).maybeSingle());
  if (!row) throw new PortalError(404, "Document not found.");
  return row as { storage_path: string; file_name: string; mime: string; size_bytes: number };
}
export async function documentFile(db: Db, c: Client, id: string) {
  const row = await ownedDocument(db, c, id);
  const res = await storage(db, "GET", row.storage_path).catch(() => null);
  if (!res || !res.ok || !res.body) throw new PortalError(res?.status === 404 ? 404 : 502, "Document not found.");
  return { stream: res.body, name: row.file_name, mime: row.mime, size: row.size_bytes };
}
export async function deleteDocument(db: Db, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new PortalError(404, "Document not found.");
  const storagePath = await rpc<string>(db, "portal_delete_document", { p_id: id }); // checks ownership + "not reviewed yet", deletes the row
  await storage(db, "DELETE", storagePath).catch(() => undefined);
}

/* ---------- checklist / e-signature / payments ---------- */
export async function setChecklistDone(db: Db, id: string, done: unknown) {
  if (typeof done !== "boolean" || !/^[0-9a-f-]{36}$/i.test(id)) throw new PortalError(400, "Invalid request.");
  await rpc(db, "portal_set_checklist", { p_id: id, p_done: done });
}
export async function signRequest(db: Db, id: string, typedName: unknown, agreed: unknown) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new PortalError(404, "Document not found.");
  await rpc(db, "portal_sign", { p_id: id, p_typed_name: text(typedName, 120), p_agree: agreed === true });
}
export async function reportPayment(db: Db, input: Record<string, unknown>) {
  const amount = toMinor(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new PortalError(400, "Enter the amount you paid.");
  const invoiceId = text(input.invoiceId, 80);
  if (!/^[0-9a-f-]{36}$/i.test(invoiceId)) throw new PortalError(404, "Invoice not found.");
  return { id: await rpc<string>(db, "portal_report_payment", { p_invoice_id: invoiceId, p_amount_minor: amount, p_method: text(input.method, 40), p_reference: text(input.reference, 120), p_note: text(input.note, 300) }) };
}
