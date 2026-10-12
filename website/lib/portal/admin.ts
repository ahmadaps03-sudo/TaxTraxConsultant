import "server-only";
import { getSupabaseConfiguration } from "../supabase/config";
import { buildBilling, toMinor } from "./service";

/**
 * Desktop-admin side of the Client Portal. The web app never holds a Supabase service-role key (same rule as the
 * access-request review): it forwards a validated action to the `portal-admin` Edge Function with a private secret,
 * and that function calls the service_role-only SQL function public.admin_portal().
 */
export class AdminError extends Error { constructor(public status: number, message: string) { super(message); } }

type Edge = { ok: boolean; data?: unknown; error?: string };

async function edge(action: string, payload: Record<string, unknown> = {}): Promise<unknown> {
  const secret = process.env.ADMIN_PORTAL_SECRET;
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(secret ?? "") || secret === process.env.ADMIN_ACCESS_REQUEST_SECRET || secret === process.env.ACCESS_REQUEST_SUBMISSION_SECRET) {
    throw new AdminError(503, "Client portal admin is not configured (ADMIN_PORTAL_SECRET).");
  }
  const { url, key } = getSupabaseConfiguration();
  if (url !== "https://dbcakdqthnamgjfkkxzn.supabase.co") throw new AdminError(503, "Client portal admin unavailable.");
  let response: Response;
  try {
    response = await fetch(`${url}/functions/v1/portal-admin`, {
      method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(12_000),
      headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${secret}` }, body: JSON.stringify({ action, payload }),
    });
  } catch { throw new AdminError(503, "Client portal admin unavailable. Please try again."); }
  const body = (await response.json().catch(() => null)) as Edge | null;
  if (response.status === 200 && body?.ok) return body.data;
  if ([400, 404, 409].includes(response.status) && body?.error) throw new AdminError(response.status, body.error);
  throw new AdminError(503, "Client portal admin unavailable. Please try again.");
}

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Every active/suspended client with their portal data, shaped for the desktop admin screen. */
export async function adminSnapshot() {
  const clients = (await edge("snapshot")) as Row[];
  if (!Array.isArray(clients)) throw new AdminError(503, "Client portal admin unavailable. Please try again.");
  return clients.map((c) => {
    const billing = buildBilling(c.invoices ?? [], c.payments ?? []);
    return {
      id: c.id, name: c.name, email: c.email, status: c.status, phone: c.contact?.phone ?? "", company: c.contact?.company ?? "", createdAt: c.createdAt,
      taxYears: (c.taxYears ?? []).map((t: Row) => ({ taxYear: t.tax_year, stage: t.stage, note: t.note, filedAt: t.filed_at })),
      checklist: (c.checklist ?? []).map((i: Row) => ({ id: i.id, label: i.label, status: i.status, taxYear: i.tax_year })),
      documents: (c.documents ?? []).map((d: Row) => ({ id: d.id, name: d.file_name, size: d.size_bytes, tag: d.tag, taxYear: d.tax_year, status: d.status, note: d.admin_note, uploadedAt: d.uploaded_at })),
      esign: (c.esign ?? []).map((e: Row) => ({ id: e.id, docKey: e.doc_key, title: e.title, status: e.status, taxYear: e.tax_year, signedAt: e.signed_at })),
      invoices: billing.invoices, payments: billing.payments, totals: billing.totals,
    };
  });
}

const pick = (b: Row, keys: string[]) => Object.fromEntries(keys.filter((k) => b[k] !== undefined && b[k] !== null && b[k] !== "").map((k) => [k, b[k]]));

/** One action per call. Accepts the desktop app's camelCase request and forwards it to the Edge Function. */
export async function adminAction(b: Row) {
  const amountMinor = () => { const m = toMinor(b.amount); if (!Number.isFinite(m) || m <= 0) throw new AdminError(400, "Enter a valid amount."); return m; };
  switch (b.action) {
    case "addInvoice": return edge("add_invoice", { ...pick(b, ["userId", "description", "currency", "taxYear", "dueAt"]), amountMinor: amountMinor() });
    case "voidInvoice": return edge("void_invoice", pick(b, ["id"]));
    case "reviewPayment": return edge("review_payment", pick(b, ["id", "decision"]));
    case "recordPayment": return edge("record_payment", { ...pick(b, ["invoiceId", "method", "reference"]), amountMinor: amountMinor() });
    case "addChecklist": return edge("add_checklist", pick(b, ["userId", "label", "taxYear", "status"]));
    case "setChecklist": return edge("set_checklist", pick(b, ["id", "status"]));
    case "removeChecklist": return edge("remove_checklist", pick(b, ["id"]));
    case "addEsign": return edge("add_esign", pick(b, ["userId", "title", "body", "docKey", "taxYear"]));
    case "removeEsign": return edge("remove_esign", pick(b, ["id"]));
    case "setTaxYear": return edge("set_tax_year", pick(b, ["userId", "taxYear", "stage", "note", "filedAt"]));
    case "setDocument": return edge("set_document", { ...pick(b, ["id", "status"]), note: typeof b.note === "string" ? b.note : "" });
    case "documentUrl": return edge("document_url", pick(b, ["id"]));
    default: throw new AdminError(400, "Unknown action.");
  }
}
