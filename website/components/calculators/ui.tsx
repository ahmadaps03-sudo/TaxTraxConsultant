"use client";
import { ReactNode, useState } from "react";
import LeadCaptureModal from "@/components/LeadCaptureModal";
import { waLink } from "@/lib/contact";

export const inr = (n: number) => Math.round(n).toLocaleString("en-IN");
export const usd = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
export const gbp = (n: number) => "£" + Math.round(n).toLocaleString("en-GB");
export const aed = (n: number) => "AED " + Math.round(n).toLocaleString("en-US");
export const pkr = (n: number) => "PKR " + inr(n);
export const pct = (n: number, d = 1) => (n * 100).toFixed(d).replace(/\.0+$/, "") + "%";
export const toNum = (s: string) => Number(s.replace(/[^\d.]/g, "")) || 0;

const base = "mt-1.5 w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm text-paper transition focus:border-signal focus:outline-none focus:ring-4 focus:ring-signal/10";

export function Money({ label, value, onChange, placeholder, hint }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: string }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-graphite">{label}</span>
      <input inputMode="numeric" className={base} placeholder={placeholder} value={value}
        onChange={(e) => { const n = e.target.value.replace(/[^\d]/g, ""); onChange(n ? Number(n).toLocaleString("en-US") : ""); }} />
      {hint && <span className="mt-1 block text-[11px] text-smoke">{hint}</span>}
    </label>
  );
}
export function Pick({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-graphite">{label}</span>
      <select className={base} value={value} onChange={(e) => onChange(e.target.value)}>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
    </label>
  );
}
export const Row = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <div className={`flex items-baseline justify-between gap-4 border-b border-white/10 py-2.5 last:border-0 ${strong ? "text-base font-semibold text-white" : "text-sm text-white/75"}`}>
    <span>{label}</span><span className={strong ? "text-lg text-signal" : "text-white"}>{value}</span>
  </div>
);
export const Results = ({ title = "Your estimate", children }: { title?: string; children: ReactNode }) => (
  <div className="mt-6 animate-pop rounded-2xl bg-gradient-to-br from-graphite to-night p-5 text-white shadow-xl">
    <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/50">{title}</p>{children}
  </div>
);
export const Empty = ({ text }: { text: string }) => <p className="mt-6 rounded-2xl border border-dashed border-line p-5 text-center text-sm text-smoke">{text}</p>;

export function RefTable({ title, head, rows, active }: { title: string; head: string[]; rows: string[][]; active?: number }) {
  return (
    <div className="mt-6">
      <h3 className="mb-2 font-serif text-sm text-paper">{title}</h3>
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-left text-xs sm:text-sm">
          <thead className="bg-cream text-smoke"><tr>{head.map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
          <tbody>{rows.map((r, i) => (
            <tr key={i} className={`border-t border-line transition-colors ${i === active ? "bg-signal/10 font-medium text-paper" : "text-paper/80"}`}>
              {r.map((c, j) => <td key={j} className="px-3 py-2">{c}</td>)}</tr>))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Report / WhatsApp / consultation actions shown under every result. */
export function Actions({ title, lines, trigger }: { title: string; lines: string[]; trigger: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-5">
      <div className="flex flex-wrap gap-3">
        <button onClick={() => setOpen(true)} className="rounded-full border border-line px-5 py-2.5 text-sm font-medium text-paper transition hover:border-signal hover:text-signal focus-ring">Download PDF report</button>
        <a href={waLink(`Hi TaxTrax, here is my ${title}:\n` + lines.join("\n"))} target="_blank" rel="noopener noreferrer" className="rounded-full bg-[#25D366] px-5 py-2.5 text-sm font-medium text-white transition hover:brightness-95 focus-ring">Send via WhatsApp</a>
        <a href="/book-consultation" className="rounded-full bg-signal px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-ember hover:shadow-lg focus-ring">Book a Consultation</a>
      </div>
      <p className="mt-4 text-xs text-smoke"><span className="font-semibold text-signal">Next step: </span>{trigger}</p>
      <LeadCaptureModal open={open} onClose={() => setOpen(false)} reportTitle={title} summaryLines={lines} />
    </div>
  );
}
export const Disclaimer = ({ children }: { children?: ReactNode }) => (
  <p className="mt-5 text-[11px] leading-relaxed text-smoke">{children ?? "Estimates are indicative and based on publicly available rates. Your actual liability depends on deductions, credits and your full circumstances. Confirm with a TaxTrax advisor before filing."}</p>
);
