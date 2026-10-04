"use client";

import Icon from "./Icon";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";

type Props = {
  open: boolean;
  onClose: () => void;
  reportTitle: string;
  /** Plain-text lines summarizing the calculation, used for the placeholder report + WhatsApp message */
  summaryLines: string[];
};

/**
 * FRONTEND-ONLY STUB:
 * - "Download PDF" currently generates a plain-text placeholder file client-side.
 *   Swap `buildPlaceholderReport` for a POST to /api/leads + /api/reports/pdf once
 *   the backend exists (e.g. a Puppeteer/PDFKit route that renders a branded template
 *   and returns a signed URL), and record the lead (name/email/whatsapp) server-side.
 * - "Send to WhatsApp" already works client-side via a wa.me deep link — no backend needed.
 */
export default function LeadCaptureModal({ open, onClose, reportTitle, summaryLines }: Props) {
  const { t } = useI18n();
  const [step, setStep] = useState<"form" | "unlocked">("form");
  const [form, setForm] = useState({ name: "", email: "", whatsapp: "" });

  if (!open) return null;

  const message = encodeURIComponent(`${reportTitle}\n\n${summaryLines.join("\n")}\n\n— via TaxTrax Consulting`);
  const waHref = `https://wa.me/?text=${message}`;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Fire-and-forget: the visitor gets their report even if lead capture hiccups.
    fetch("/api/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, reportTitle }) }).catch(() => {});
    setStep("unlocked");
  };

  const downloadPlaceholder = () => {
    const blob = new Blob(
      [`${reportTitle}\n${"=".repeat(reportTitle.length)}\n\n${summaryLines.join("\n")}\n\nPrepared for: ${form.name}\nTaxTrax Consulting — this file is a placeholder; production build renders a branded PDF.`],
      { type: "text/plain" }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${reportTitle.replace(/\s+/g, "-").toLowerCase()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-night/70 p-4">
      <div className="card-flat w-full max-w-md p-6">
        <div className="flex items-start justify-between">
          <h3 className="font-serif text-lg text-paper">{reportTitle}</h3>
          <button onClick={onClose} aria-label="Close" className="text-smoke hover:text-signal focus-ring"><Icon name="x" size={18} /></button>
        </div>

        {step === "form" && (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <p className="text-sm text-smoke">
              Enter your details to unlock your PDF result and a WhatsApp copy for our specialists.
            </p>
            <Field label="Full name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
            <Field label="Email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} required />
            <Field label="WhatsApp number" value={form.whatsapp} onChange={(v) => setForm({ ...form, whatsapp: v })} required />
            <button type="submit" className="w-full bg-signal px-4 py-2.5 text-sm font-medium text-ink hover:bg-ember transition-colors focus-ring">
              {t("cta.get_result")}
            </button>
          </form>
        )}

        {step === "unlocked" && (
          <div className="mt-4 space-y-3">
            <div className="border border-line bg-charcoal p-4 text-sm text-paper/85">
              {summaryLines.map((l) => (
                <p key={l}>{l}</p>
              ))}
            </div>
            <button onClick={downloadPlaceholder} className="w-full border border-line px-4 py-2.5 text-sm text-paper hover:border-signal hover:text-signal transition-colors focus-ring">
              {t("cta.download_pdf")}
            </button>
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full bg-ok px-4 py-2.5 text-center text-sm font-medium text-paper hover:opacity-90 transition-opacity focus-ring"
            >
              {t("cta.send_whatsapp")}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, type = "text", required,
}: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean }) {
  return (
    <label className="block">
      <span className="text-xs text-smoke">{label}</span>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full border border-line bg-charcoal px-3 py-2 text-sm text-paper focus-ring focus:border-signal"
      />
    </label>
  );
}
