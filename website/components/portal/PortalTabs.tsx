"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { getOverview } from "@/lib/portal/service";
import { waLink } from "@/lib/contact";

/* ------------------------------------------------------------------------------------------------
   All seven portal tabs. Data comes from GET /api/client/overview (one call); every change goes
   through its own /api/client/* endpoint and then re-loads the overview, so the screen always
   shows what the server actually saved.
   ------------------------------------------------------------------------------------------------ */

type Overview = Awaited<ReturnType<typeof getOverview>>;
type Nav = (tab: string) => void;

class ApiError extends Error {
  constructor(public status: number, message: string, public fields?: Record<string, string>) { super(message); }
}

async function api<T = unknown>(method: string, url: string, body?: unknown): Promise<T> {
  const form = typeof FormData !== "undefined" && body instanceof FormData;
  const response = await fetch(url, {
    method, credentials: "same-origin", cache: "no-store",
    headers: { "X-TaxTrax-Auth": "1", ...(body !== undefined && !form ? { "Content-Type": "application/json" } : {}) },
    body: body === undefined ? undefined : form ? (body as FormData) : JSON.stringify(body),
  });
  if (response.status === 401) { window.location.replace("/portal"); throw new ApiError(401, "Your session has ended. Please log in again."); }
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.ok) throw new ApiError(response.status, json?.error || "Something went wrong. Please try again.", json?.fields);
  return json.data as T;
}
const errText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong. Please try again.");

/* ---------- formatting ---------- */
const money = (minor: number, currency = "PKR") => {
  const whole = minor % 100 === 0;
  try { return new Intl.NumberFormat("en", { style: "currency", currency, currencyDisplay: "code", minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 }).format(minor / 100).replace(/\u00a0/g, " "); }
  catch { return `${currency} ${(minor / 100).toLocaleString()}`; }
};
const day = (iso?: string | null) => (iso ? new Date(iso.length === 10 ? iso + "T00:00:00" : iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");
const bytes = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`);

/* ---------- data hook ---------- */
function usePortalData() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try { setData(await api<Overview>("GET", "/api/client/overview")); setError(null); }
    catch (e) { setError(errText(e)); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  return { data, error, reload };
}

/* ---------- shared bits ---------- */
const input = "w-full border border-line bg-charcoal px-3 py-2 text-sm text-paper outline-none focus-ring focus:border-signal disabled:opacity-60";
const primaryBtn = "bg-signal px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-ember focus-ring disabled:cursor-not-allowed disabled:opacity-60";
const ghostBtn = "border border-line px-3 py-1.5 text-xs text-smoke transition-colors hover:border-signal hover:text-paper focus-ring disabled:opacity-60";

const PILL: Record<string, string> = {
  Completed: "text-ok border-ok", Paid: "text-ok border-ok", Signed: "text-ok border-ok", Confirmed: "text-ok border-ok", Reviewed: "text-ok border-ok", Filed: "text-ok border-ok",
  "Needs Action": "text-signal border-signal", Overdue: "text-signal border-signal", Rejected: "text-signal border-signal", "Needs Attention": "text-signal border-signal",
};
export function StatusPill({ status }: { status: string }) {
  return <span className={`whitespace-nowrap border px-2 py-0.5 text-xs ${PILL[status] ?? "text-smoke border-line"}`}>{status}</span>;
}

function Notice({ notice }: { notice: { ok: boolean; text: string } | null }) {
  if (!notice) return null;
  return <p role={notice.ok ? "status" : "alert"} className={`mt-3 text-sm ${notice.ok ? "text-ok" : "text-signal"}`}>{notice.text}</p>;
}

function Stat({ label, value, sub, delay = 0 }: { label: string; value: string; sub?: string; delay?: number }) {
  return (
    <div className="ap-rise rounded-lg border border-line p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-signal hover:shadow-sm" style={{ animationDelay: `${delay}ms` }}>
      <p className="text-xs text-smoke">{label}</p>
      <p className="mt-1 font-serif text-lg text-paper">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-smoke">{sub}</p>}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-4 text-sm text-smoke">{children}</p>;
}

function Card({ title, children, delay = 0, action }: { title: string; children: React.ReactNode; delay?: number; action?: React.ReactNode }) {
  return (
    <section className="card-flat ap-rise p-6" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-serif text-lg text-paper">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/* =========================================== root =========================================== */
export function PortalTabs({ active, onNavigate }: { active: string; onNavigate: Nav }) {
  const { data, error, reload } = usePortalData();
  if (error && !data) {
    return (
      <div className="card-flat mt-8 p-7 text-center text-sm">
        <p role="alert" className="text-signal">{error}</p>
        <button onClick={() => void reload()} className={`${ghostBtn} mt-4`}>Try again</button>
      </div>
    );
  }
  if (!data) return <div className="mt-8 space-y-4" aria-busy="true" aria-label="Loading your account">{[1, 2, 3].map((n) => <div key={n} className="h-24 animate-pulse rounded-lg bg-charcoal" />)}</div>;
  const props = { data, reload, onNavigate };
  return (
    <div key={active}>
      {error && <p role="alert" className="mt-4 text-sm text-signal">{error}</p>}
      {active === "Dashboard" && <DashboardTab {...props} />}
      {active === "Documents" && <DocumentsTab {...props} />}
      {active === "Checklist" && <ChecklistTab {...props} />}
      {active === "E-Signature" && <ESignTab {...props} />}
      {active === "Billing & Payments" && <BillingTab {...props} />}
      {active === "Tax Years" && <TaxYearsTab {...props} />}
      {active === "Profile" && <ProfileTab {...props} />}
    </div>
  );
}
type TabProps = { data: Overview; reload: () => Promise<void>; onNavigate: Nav };

/* ========================================= dashboard ======================================== */
function DashboardTab({ data, reload, onNavigate }: TabProps) {
  const year = data.taxYears.find((t) => t.taxYear === data.activeYear);
  const tasks = data.checklist.filter((i) => i.taxYear === data.activeYear);
  const overdue = data.billing.invoices.filter((i) => i.status === "Overdue").length;
  return (
    <>
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Tax year" value={`${data.activeYear} · ${year?.stage ?? "Collecting documents"}`} delay={80} />
        <Stat label="Pending tasks" value={String(data.stats.pendingTasks)} delay={160} />
        <Stat label="Documents awaiting review" value={String(data.stats.documentsAwaitingReview)} delay={240} />
        <Stat label="Remaining balance" value={money(data.stats.outstanding, data.stats.currency)} sub={overdue ? `${overdue} overdue` : undefined} delay={320} />
      </div>

      {(data.stats.signaturesWaiting > 0 || overdue > 0) && (
        <div className="ap-rise mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 border border-signal/40 bg-cream px-4 py-3 text-sm">
          {data.stats.signaturesWaiting > 0 && <button onClick={() => onNavigate("E-Signature")} className="text-signal underline-offset-2 hover:underline">{data.stats.signaturesWaiting} document{data.stats.signaturesWaiting > 1 ? "s" : ""} waiting for your signature →</button>}
          {overdue > 0 && <button onClick={() => onNavigate("Billing & Payments")} className="text-signal underline-offset-2 hover:underline">{overdue} overdue invoice{overdue > 1 ? "s" : ""} →</button>}
        </div>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card title="Document upload" delay={300}>
          <UploadForm data={data} reload={reload} compact />
          <h3 className="mt-6 text-sm font-medium text-paper">Recent documents</h3>
          {data.documents.length ? (
            <ul className="mt-2 divide-y divide-line">
              {data.documents.slice(0, 4).map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="truncate text-paper/85">{d.name}</span>
                  <span className="shrink-0 text-xs text-smoke">{d.tag} · {day(d.uploadedAt)}</span>
                </li>
              ))}
            </ul>
          ) : <Empty>No documents yet. Upload your first one above.</Empty>}
          {data.documents.length > 4 && <button onClick={() => onNavigate("Documents")} className="mt-2 text-xs text-signal hover:text-ember">View all {data.documents.length} documents →</button>}
        </Card>

        <Card title="Your checklist" delay={380}>
          {tasks.length ? (
            <ul className="mt-4 space-y-3">
              {tasks.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 border-b border-line pb-3 text-sm last:border-0">
                  <span className="text-paper/85">{item.label}</span>
                  <StatusPill status={item.status} />
                </li>
              ))}
            </ul>
          ) : <Empty>Nothing on your checklist for {data.activeYear} yet.</Empty>}
          <button onClick={() => onNavigate("Checklist")} className="mt-3 text-xs text-signal hover:text-ember">Open checklist →</button>

          <h3 className="mt-6 text-sm font-medium text-paper">Upcoming appointments</h3>
          {data.appointments.length ? (
            <ul className="mt-2 divide-y divide-line">
              {data.appointments.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="text-paper/85">{a.service}</span>
                  <span className="text-xs text-smoke">{day(a.date)} · {a.time} · {a.status === "confirmed" ? "Confirmed" : "Awaiting confirmation"}</span>
                </li>
              ))}
            </ul>
          ) : <p className="mt-2 text-sm text-smoke">No upcoming appointments.</p>}
          <a href="/book-consultation" className="mt-3 inline-block bg-signal px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-ember focus-ring">Book a consultation</a>
        </Card>
      </div>
    </>
  );
}

/* ====================================== upload (shared) ===================================== */
function UploadForm({ data, reload, compact = false }: { data: Overview; reload: () => Promise<void>; compact?: boolean }) {
  const thisYear = new Date().getFullYear();
  const years = Array.from(new Set([data.activeYear, thisYear, thisYear - 1, thisYear - 2, ...data.taxYears.map((t) => t.taxYear)])).sort((a, b) => b - a);
  const [year, setYear] = useState(data.activeYear);
  const [tag, setTag] = useState<string>(data.options.docTags[0]);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const pick = useRef<HTMLInputElement>(null);

  const upload = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length || busy) return;
    setBusy(true); setNotice(null);
    const failed: string[] = []; let done = 0;
    for (const file of list) {
      if (file.size > data.options.maxFileBytes) { failed.push(`${file.name}: larger than 25 MB`); continue; }
      let upload: { path: string; uploadUrl: string; contentType: string } | undefined;
      try {
        upload = await api<{ path: string; uploadUrl: string; contentType: string }>("POST", "/api/client/documents", { name: file.name, size: file.size, tag, taxYear: year });
        const form = new FormData();
        form.append("cacheControl", "3600");
        // Label the part with the server's expected type; browsers report CSV/Office types inconsistently.
        form.append("", new Blob([file], { type: upload.contentType }), file.name);
        const stored = await fetch(upload.uploadUrl, { method: "PUT", body: form, cache: "no-store", referrerPolicy: "no-referrer", headers: { "x-upsert": "false" } });
        if (!stored.ok) throw new Error("We couldn't store that file. Please try again.");
        await api("POST", "/api/client/documents/complete", { path: upload.path, name: file.name, size: file.size, tag, taxYear: year });
        done++;
      } catch (e) {
        if (upload) await api("DELETE", "/api/client/documents/upload", { path: upload.path }).catch(() => undefined);
        failed.push(`${file.name}: ${errText(e)}`);
      }
    }
    if (pick.current) pick.current.value = "";
    setBusy(false);
    setNotice(failed.length ? { ok: false, text: `${done ? `${done} uploaded. ` : ""}${failed.join(" · ")}` } : { ok: true, text: `${done} file${done > 1 ? "s" : ""} uploaded. Our team will review ${done > 1 ? "them" : "it"} shortly.` });
    await reload();
  };

  return (
    <div className="mt-4">
      <div className={`grid gap-3 ${compact ? "grid-cols-2" : "sm:grid-cols-2"}`}>
        <label className="block text-xs text-smoke">Document type
          <select value={tag} onChange={(e) => setTag(e.target.value)} disabled={busy} className={`${input} mt-1`}>{data.options.docTags.map((t) => <option key={t}>{t}</option>)}</select>
        </label>
        <label className="block text-xs text-smoke">Tax year
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} disabled={busy} className={`${input} mt-1`}>{years.map((y) => <option key={y}>{y}</option>)}</select>
        </label>
      </div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); void upload(e.dataTransfer.files); }}
        className={`mt-3 flex h-32 flex-col items-center justify-center border border-dashed text-center text-sm transition-colors ${drag ? "border-signal bg-cream text-paper" : "border-line text-smoke"}`}
      >
        {busy ? <p>Uploading…</p> : (
          <>
            <p>Drag and drop your files here, or <button type="button" onClick={() => pick.current?.click()} className="text-signal underline-offset-2 hover:underline focus-ring">browse</button></p>
            <p className="text-xs">PDF, JPG, PNG, Excel, Word, CSV (max 25 MB each)</p>
          </>
        )}
        <input ref={pick} type="file" multiple hidden accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls,.doc,.docx,.csv" onChange={(e) => e.target.files && void upload(e.target.files)} />
      </div>
      <Notice notice={notice} />
    </div>
  );
}

/* ========================================= documents ======================================== */
function DocumentsTab({ data, reload }: TabProps) {
  const [filter, setFilter] = useState<number | "all">("all");
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const years = Array.from(new Set(data.documents.map((d) => d.taxYear))).sort((a, b) => b - a);
  const rows = data.documents.filter((d) => filter === "all" || d.taxYear === filter);
  const remove = async (id: string, name: string) => {
    if (!window.confirm(`Remove "${name}"?`)) return;
    setBusyId(id); setNotice(null);
    try { await api("DELETE", `/api/client/documents/${id}`); setNotice({ ok: true, text: "Document removed." }); await reload(); }
    catch (e) { setNotice({ ok: false, text: errText(e) }); }
    setBusyId(null);
  };
  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-5">
      <div className="lg:col-span-2"><Card title="Upload documents"><UploadForm data={data} reload={reload} /></Card></div>
      <div className="lg:col-span-3">
        <Card title="Your documents" delay={80} action={years.length > 1 ? (
          <select aria-label="Filter by tax year" value={filter} onChange={(e) => setFilter(e.target.value === "all" ? "all" : Number(e.target.value))} className="border border-line bg-charcoal px-2 py-1 text-xs text-paper focus-ring">
            <option value="all">All years</option>{years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>) : null}>
          <Notice notice={notice} />
          {rows.length ? (
            <ul className="mt-3 divide-y divide-line">
              {rows.map((d) => (
                <li key={d.id} className="py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-paper/90">{d.name}</p>
                      <p className="text-xs text-smoke">{d.tag} · {d.taxYear} · {bytes(d.size)} · {day(d.uploadedAt)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusPill status={d.status} />
                      <a href={`/api/client/documents/${d.id}`} className={ghostBtn}>Download</a>
                      {d.canDelete && <button onClick={() => void remove(d.id, d.name)} disabled={busyId === d.id} className={ghostBtn}>Remove</button>}
                    </div>
                  </div>
                  {d.note && <p className="mt-1 text-xs text-smoke">Note from TaxTrax: {d.note}</p>}
                </li>
              ))}
            </ul>
          ) : <Empty>{data.documents.length ? "No documents for this year." : "You haven't uploaded anything yet."}</Empty>}
        </Card>
      </div>
    </div>
  );
}

/* ========================================= checklist ======================================== */
function ChecklistTab({ data, reload, onNavigate }: TabProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const years = Array.from(new Set(data.checklist.map((i) => i.taxYear))).sort((a, b) => b - a);
  const toggle = async (id: string, done: boolean) => {
    setBusyId(id); setNotice(null);
    try { await api("PATCH", `/api/client/checklist/${id}`, { done }); await reload(); }
    catch (e) { setNotice({ ok: false, text: errText(e) }); }
    setBusyId(null);
  };
  const total = data.checklist.length, done = data.checklist.filter((i) => i.status === "Completed").length;
  return (
    <div className="mt-6 space-y-6">
      <div className="ap-rise flex items-center gap-4">
        <div className="h-2 flex-1 bg-charcoal" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label="Checklist progress"><div className="h-2 bg-ok transition-all duration-500" style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></div>
        <p className="text-sm text-smoke">{done} of {total} complete</p>
      </div>
      <Notice notice={notice} />
      {years.length === 0 && <Card title="Checklist"><Empty>Your checklist will appear here.</Empty></Card>}
      {years.map((y) => (
        <Card key={y} title={`Tax year ${y}`}>
          <ul className="mt-4 space-y-3">
            {data.checklist.filter((i) => i.taxYear === y).map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3 text-sm last:border-0">
                <label className={`flex items-center gap-3 ${item.selfService ? "cursor-pointer" : ""}`}>
                  {item.selfService
                    ? <input type="checkbox" checked={item.status === "Completed"} disabled={busyId === item.id} onChange={(e) => void toggle(item.id, e.target.checked)} className="h-4 w-4 accent-signal" />
                    : <span aria-hidden className={`grid h-4 w-4 place-items-center border text-[10px] ${item.status === "Completed" ? "border-ok bg-ok text-ink" : "border-line"}`}>{item.status === "Completed" ? "✓" : ""}</span>}
                  <span className={item.status === "Completed" ? "text-smoke line-through" : "text-paper/90"}>{item.label}</span>
                </label>
                <span className="flex items-center gap-2">
                  {!item.selfService && item.status !== "Completed" && (item.label.toLowerCase().includes("upload")
                    ? <button onClick={() => onNavigate("Documents")} className={ghostBtn}>Upload</button>
                    : item.label.toLowerCase().includes("sign") ? <button onClick={() => onNavigate("E-Signature")} className={ghostBtn}>Sign</button> : null)}
                  <StatusPill status={item.status} />
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

/* ======================================== e-signature ======================================= */
function ESignTab({ data, reload }: TabProps) {
  const pending = data.esign.filter((e) => e.status === "Pending");
  const signed = data.esign.filter((e) => e.status === "Signed");
  return (
    <div className="mt-6 space-y-6">
      {pending.length === 0 && <Card title="Waiting for your signature"><Empty>Nothing needs your signature right now. We&apos;ll notify you here when a document is ready.</Empty></Card>}
      {pending.map((e) => <SignCard key={e.id} doc={e} name={data.profile.name} reload={reload} />)}
      {signed.length > 0 && (
        <Card title="Signed documents">
          <ul className="mt-3 divide-y divide-line">
            {signed.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <div><p className="text-paper/90">{e.title}</p><p className="text-xs text-smoke">Signed by {e.signedName} on {day(e.signedAt)}</p></div>
                <StatusPill status="Signed" />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function SignCard({ doc, name, reload }: { doc: Overview["esign"][number]; name: string; reload: () => Promise<void> }) {
  const [typed, setTyped] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const sign = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setNotice(null);
    try { await api("POST", `/api/client/esign/${doc.id}`, { typedName: typed, agree }); await reload(); }
    catch (e) { setNotice({ ok: false, text: errText(e) }); setBusy(false); }
  };
  return (
    <Card title={doc.title} action={<StatusPill status="Needs Action" />}>
      {doc.body && <div className="mt-4 max-h-64 overflow-y-auto whitespace-pre-line border border-line bg-charcoal p-4 text-sm text-paper/85" tabIndex={0} aria-label={`${doc.title} text`}>{doc.body}</div>}
      <form onSubmit={sign} className="mt-4 space-y-3">
        <label className="block text-xs text-smoke">Type your full name to sign — <span className="text-paper">{name}</span>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" required disabled={busy} className={`${input} mt-1 font-serif italic`} placeholder={name} />
        </label>
        <label className="flex items-start gap-2 text-sm text-paper/85">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} disabled={busy} className="mt-0.5 h-4 w-4 accent-signal" />
          <span>I have read this document and agree to sign it electronically. I understand this has the same effect as my handwritten signature.</span>
        </label>
        <button type="submit" disabled={busy || !agree || !typed.trim()} className={primaryBtn}>{busy ? "Signing…" : "Sign document"}</button>
        <Notice notice={notice} />
      </form>
    </Card>
  );
}

/* ================================== billing & payments ====================================== */
function BillingTab({ data, reload }: TabProps) {
  const { invoices, payments, totals } = data.billing;
  const [open, setOpen] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="mt-6 space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Total invoiced" value={money(totals.invoiced, totals.currency)} delay={0} />
        <Stat label="Paid" value={money(totals.paid, totals.currency)} delay={80} />
        <Stat label="Awaiting confirmation" value={money(totals.pendingReview, totals.currency)} delay={160} />
        <Stat label="Remaining balance" value={money(totals.outstanding, totals.currency)} delay={240} />
      </div>
      <Notice notice={notice} />

      <Card title="Invoices" delay={200}>
        {invoices.length ? (
          <ul className="mt-3 divide-y divide-line">
            {invoices.filter((i) => i.status !== "Void").map((i) => {
              const payable = i.status === "Open" || i.status === "Overdue";
              return (
                <li key={i.id} className="py-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-paper/90">{i.description}</p>
                      <p className="text-xs text-smoke">{i.number}{i.taxYear ? ` · Tax year ${i.taxYear}` : ""} · Issued {day(i.issuedAt)}{i.dueAt && i.status !== "Paid" ? ` · Due ${day(i.dueAt)}` : ""}</p>
                    </div>
                    <div className="flex items-center gap-3 text-right">
                      <div>
                        <p className="font-serif text-paper">{money(i.amount, i.currency)}</p>
                        {i.status !== "Paid" && <p className="text-xs text-smoke">Remaining {money(i.balance, i.currency)}{i.pending ? ` · ${money(i.pending, i.currency)} awaiting confirmation` : ""}</p>}
                      </div>
                      <StatusPill status={i.status} />
                    </div>
                  </div>
                  {payable && (open === i.id
                    ? <PayForm invoice={i} methods={data.options.paymentMethods} onDone={async (text) => { setOpen(null); setNotice({ ok: true, text }); await reload(); }} onCancel={() => setOpen(null)} />
                    : <button onClick={() => { setNotice(null); setOpen(i.id); }} className={`${primaryBtn} mt-3 !py-1.5 !text-xs`}>I&apos;ve paid — report payment</button>)}
                </li>
              );
            })}
          </ul>
        ) : <Empty>No invoices yet. When we invoice you, it will show up here.</Empty>}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Payment history" delay={260}>
          {payments.length ? (
            <ul className="mt-3 divide-y divide-line">
              {payments.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                  <div><p className="text-paper/90">{money(p.amount, totals.currency)} · {p.method}</p><p className="text-xs text-smoke">{p.invoiceNumber} · Ref {p.reference} · {day(p.createdAt)}</p></div>
                  <StatusPill status={p.status} />
                </li>
              ))}
            </ul>
          ) : <Empty>No payments recorded yet.</Empty>}
        </Card>
        <Card title="How to pay" delay={320}>
          <p className="mt-3 text-sm text-smoke">Pay by bank transfer, JazzCash or Easypaisa, or at our office. Then press <b className="text-paper">report payment</b> on the invoice with your transaction ID — we&apos;ll confirm it and update your balance.</p>
          <a href={waLink("Hi TaxTrax, please share the payment details for my invoice.")} target="_blank" rel="noopener noreferrer" className="mt-4 inline-block border border-line px-4 py-2 text-sm text-paper transition-colors hover:border-signal focus-ring">Get payment details on WhatsApp</a>
        </Card>
      </div>
    </div>
  );
}

function PayForm({ invoice, methods, onDone, onCancel }: { invoice: Overview["billing"]["invoices"][number]; methods: readonly string[]; onDone: (message: string) => Promise<void>; onCancel: () => void }) {
  const owed = Math.max(0, invoice.balance - invoice.pending);
  const [amount, setAmount] = useState(String(owed / 100));
  const [method, setMethod] = useState(methods[0]);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(null);
    try { await api("POST", "/api/client/payments", { invoiceId: invoice.id, amount: Number(amount), method, reference, note }); await onDone("Thanks — we've received your payment details and will confirm shortly."); }
    catch (e) { setError(errText(e)); setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="mt-3 grid gap-3 border border-line bg-charcoal p-4 sm:grid-cols-2">
      <label className="block text-xs text-smoke">Amount paid ({invoice.currency})<input type="number" min="0" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} disabled={busy} className={`${input} mt-1`} /></label>
      <label className="block text-xs text-smoke">Paid via<select value={method} onChange={(e) => setMethod(e.target.value)} disabled={busy} className={`${input} mt-1`}>{methods.map((m) => <option key={m}>{m}</option>)}</select></label>
      <label className="block text-xs text-smoke sm:col-span-2">Transaction ID / reference<input required minLength={3} maxLength={120} value={reference} onChange={(e) => setReference(e.target.value)} disabled={busy} className={`${input} mt-1`} placeholder="e.g. the TID from your bank or wallet receipt" /></label>
      <label className="block text-xs text-smoke sm:col-span-2">Note (optional)<input maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} disabled={busy} className={`${input} mt-1`} /></label>
      {error && <p role="alert" className="text-sm text-signal sm:col-span-2">{error}</p>}
      <div className="flex gap-2 sm:col-span-2">
        <button type="submit" disabled={busy} className={primaryBtn}>{busy ? "Sending…" : "Submit payment details"}</button>
        <button type="button" onClick={onCancel} disabled={busy} className={ghostBtn}>Cancel</button>
      </div>
    </form>
  );
}

/* ========================================== tax years ======================================= */
function TaxYearsTab({ data }: TabProps) {
  const stages = data.options.taxStages;
  return (
    <div className="mt-6 space-y-6">
      {data.taxYears.map((t, n) => (
        <Card key={t.taxYear} title={`Tax year ${t.taxYear}`} delay={n * 80} action={<StatusPill status={t.stage === "Awaiting your review" ? "Needs Action" : t.stage === "Filed" || t.stage === "Completed" ? "Filed" : "Pending"} />}>
          <ol className="mt-5 grid grid-cols-5 gap-2" aria-label={`Progress for tax year ${t.taxYear}`}>
            {stages.map((s, i) => (
              <li key={s} className="text-center" aria-current={i === t.stageIndex ? "step" : undefined}>
                <div className={`mx-auto grid h-7 w-7 place-items-center rounded-full border text-xs ${i < t.stageIndex ? "border-ok bg-ok text-ink" : i === t.stageIndex ? "border-signal bg-signal text-ink" : "border-line text-smoke"}`}>{i < t.stageIndex ? "✓" : i + 1}</div>
                <p className={`mt-2 text-[11px] leading-tight ${i === t.stageIndex ? "text-paper" : "text-smoke"}`}>{s}</p>
              </li>
            ))}
          </ol>
          <dl className="mt-5 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            <div><dt className="text-xs text-smoke">Current stage</dt><dd className="text-paper/90">{t.stage}</dd></div>
            <div><dt className="text-xs text-smoke">Filed on</dt><dd className="text-paper/90">{day(t.filedAt)}</dd></div>
            <div><dt className="text-xs text-smoke">Last updated</dt><dd className="text-paper/90">{day(t.updatedAt)}</dd></div>
          </dl>
          {t.note && <p className="mt-4 border-l-2 border-signal pl-3 text-sm text-paper/85">{t.note}</p>}
        </Card>
      ))}
      {data.taxYears.length === 0 && <Card title="Tax years"><Empty>Your tax years will appear here.</Empty></Card>}
    </div>
  );
}

/* ============================================ profile ======================================= */
function ProfileTab({ data, reload }: TabProps) {
  const p = data.profile;
  const [form, setForm] = useState({ phone: p.phone, company: p.company, country: p.country, address: p.address, city: p.city });
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = (Object.keys(form) as (keyof typeof form)[]).some((k) => form[k] !== p[k]);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setNotice(null); setFields({});
    try { await api("PUT", "/api/client/profile", form); await reload(); setNotice({ ok: true, text: "Profile saved." }); }
    catch (e) { setFields(e instanceof ApiError ? e.fields ?? {} : {}); setNotice({ ok: false, text: errText(e) }); }
    setBusy(false);
  };
  const field = (k: keyof typeof form, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block text-xs text-smoke">{label}
      <input value={form[k]} onChange={set(k)} disabled={busy} aria-invalid={!!fields[k]} className={`${input} mt-1 ${fields[k] ? "!border-signal" : ""}`} {...extra} />
      {fields[k] && <span role="alert" className="mt-1 block text-signal">{fields[k]}</span>}
    </label>
  );
  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-5">
      <div className="lg:col-span-2">
        <Card title="Account">
          <dl className="mt-4 space-y-3 text-sm">
            <div><dt className="text-xs text-smoke">Full name</dt><dd className="text-paper/90">{p.name}</dd></div>
            <div><dt className="text-xs text-smoke">Email (used to log in)</dt><dd className="break-all text-paper/90">{p.email}</dd></div>
            <div><dt className="text-xs text-smoke">Client since</dt><dd className="text-paper/90">{day(p.memberSince)}</dd></div>
            <div><dt className="text-xs text-smoke">Account status</dt><dd><StatusPill status="Completed" /> <span className="ml-1 text-xs text-smoke">Active</span></dd></div>
          </dl>
          <p className="mt-5 text-xs text-smoke">Your name and email are tied to your secure login. To change them, <a className="text-signal hover:text-ember" href={waLink("Hi TaxTrax, I'd like to update my name/email on my client account.")} target="_blank" rel="noopener noreferrer">message us</a>.</p>
          <a href="/portal/forgot-password" className={`${ghostBtn} mt-4 inline-block`}>Change password</a>
        </Card>
      </div>
      <div className="lg:col-span-3">
        <Card title="Contact details" delay={80}>
          <form onSubmit={save} className="mt-4 grid gap-4 sm:grid-cols-2" noValidate>
            {field("phone", "Phone / WhatsApp", { type: "tel", autoComplete: "tel", placeholder: "+92 300 1234567" })}
            {field("company", "Company / business (optional)", { autoComplete: "organization" })}
            <div className="sm:col-span-2">{field("address", "Address", { autoComplete: "street-address" })}</div>
            {field("city", "City", { autoComplete: "address-level2" })}
            {field("country", "Country", { autoComplete: "country-name" })}
            <div className="flex items-center gap-3 sm:col-span-2">
              <button type="submit" disabled={busy || !dirty} className={primaryBtn}>{busy ? "Saving…" : "Save changes"}</button>
              {!dirty && !notice && <span className="text-xs text-smoke">No changes to save.</span>}
            </div>
            <div className="sm:col-span-2"><Notice notice={notice} /></div>
          </form>
        </Card>
      </div>
    </div>
  );
}
