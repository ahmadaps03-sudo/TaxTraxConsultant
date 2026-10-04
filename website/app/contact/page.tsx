"use client";

import { useState } from "react";
import Icon from "@/components/Icon";
import { OFFICE, waLink, mapsDirections } from "@/lib/contact";
import { validateContact } from "@/lib/validation";

type Form = { name: string; email: string; phone: string; subject: string; message: string; website: string };
const EMPTY: Form = { name: "", email: "", phone: "", subject: "", message: "", website: "" };
const input = "mt-1.5 w-full rounded-xl border bg-white px-4 py-3 text-sm text-paper transition focus:outline-none focus:ring-4";

export default function ContactPage() {
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [serverError, setServerError] = useState("");
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { setForm({ ...form, [k]: e.target.value }); if (errors[k]) setErrors({ ...errors, [k]: "" }); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = validateContact(form);
    if (!v.ok) { setErrors(v.fields); return; }
    setStatus("sending"); setServerError(""); setErrors({});
    try {
      const res = await fetch("/api/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.ok) { setStatus("sent"); setForm(EMPTY); return; }
      if (j?.fields) setErrors(j.fields);
      setServerError(j?.error || "We couldn't send your message. Please try again.");
      setStatus("error");
    } catch {
      setServerError("Network error. Check your connection and try again, or message us on WhatsApp.");
      setStatus("error");
    }
  };

  const field = (k: keyof Form, label: string, props: { type?: string; placeholder?: string; autoComplete?: string } = {}) => (
    <label className="block">
      <span className="text-xs font-semibold text-graphite">{label}</span>
      <input value={form[k]} onChange={set(k)} aria-invalid={!!errors[k]} aria-describedby={errors[k] ? `${k}-err` : undefined}
        className={`${input} ${errors[k] ? "border-signal focus:ring-signal/15" : "border-line focus:border-signal focus:ring-signal/10"}`} {...props} />
      {errors[k] && <span id={`${k}-err`} role="alert" className="mt-1 block text-xs text-signal">{errors[k]}</span>}
    </label>
  );

  return (
    <div className="relative overflow-hidden">
      <div className="bg-grid-fade absolute inset-0" aria-hidden />
      <div className="relative mx-auto max-w-[1200px] px-5 py-16">
        <span className="mb-4 block h-1 w-12 rounded-full bg-signal" aria-hidden />
        <h1 className="font-serif text-3xl text-paper sm:text-4xl">Contact Us</h1>
        <p className="mt-3 max-w-xl text-sm text-smoke">Tell us what you need and a TaxTrax specialist will reply within one business day. For the fastest answer, message us on WhatsApp.</p>

        <div className="mt-12 grid gap-8 lg:grid-cols-5">
          <div className="space-y-5 lg:col-span-2">
            <a href={waLink("Hi TaxTrax, I have a question.")} target="_blank" rel="noopener noreferrer" className="card-flat card-lift flex items-center justify-between gap-4 p-6 focus-ring">
              <span><span className="block font-serif text-lg text-paper">Chat on WhatsApp</span><span className="text-sm text-smoke">Fastest way to get an answer or a quote.</span></span>
              <span className="rounded-full bg-[#25D366] px-4 py-2 text-sm font-medium text-white">Chat now</span>
            </a>
            <div className="card-flat p-6">
              <h2 className="font-serif text-lg text-paper">Head Office, {OFFICE.city}</h2>
              <ul className="mt-4 space-y-3 text-sm text-paper/85">
                <li>{OFFICE.addressLines.map((l) => <span key={l} className="block">{l}</span>)}</li>
                <li><a href={`tel:${OFFICE.phoneTel}`} className="hover:text-signal">{OFFICE.phoneDisplay}</a></li>
                <li><a href={`mailto:${OFFICE.email}`} className="hover:text-signal">{OFFICE.email}</a></li>
                <li className="text-smoke">{OFFICE.hours}</li>
              </ul>
              <a href={mapsDirections} target="_blank" rel="noopener noreferrer" className="mt-5 inline-block text-sm font-medium text-signal hover:text-ember">Get directions →</a>
            </div>
          </div>

          <div className="lg:col-span-3">
            {status === "sent" ? (
              <div className="card-flat animate-pop p-7 text-center" role="status">
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><Icon name="check" size={26} /></span>
                <h2 className="mt-5 font-serif text-2xl text-paper">Message received</h2>
                <p className="mx-auto mt-2 max-w-sm text-sm text-smoke">Thank you. A TaxTrax specialist will reply to your email within one business day.</p>
                <button onClick={() => setStatus("idle")} className="mt-6 rounded-full border border-line px-6 py-2.5 text-sm text-paper transition hover:border-signal hover:text-signal focus-ring">Send another message</button>
              </div>
            ) : (
              <form onSubmit={submit} noValidate className="card-flat space-y-5 p-6 sm:p-6">
                <div className="grid gap-5 sm:grid-cols-2">{field("name", "Name", { autoComplete: "name", placeholder: "Your full name" })}{field("email", "Email", { type: "email", autoComplete: "email", placeholder: "you@example.com" })}</div>
                {field("phone", "Phone / WhatsApp", { type: "tel", autoComplete: "tel", placeholder: "+92 300 0000000" })}
                {field("subject", "Subject", { placeholder: "e.g. FBR return for 2026" })}
                <label className="block">
                  <span className="text-xs font-semibold text-graphite">Message</span>
                  <textarea value={form.message} onChange={set("message")} rows={6} aria-invalid={!!errors.message} placeholder="Tell us a little about your situation…"
                    className={`${input} resize-y ${errors.message ? "border-signal focus:ring-signal/15" : "border-line focus:border-signal focus:ring-signal/10"}`} />
                  <span className="mt-1 flex justify-between text-xs"><span role="alert" className="text-signal">{errors.message}</span><span className="text-smoke">{form.message.length}/4000</span></span>
                </label>
                {/* honeypot: hidden from people, filled by bots */}
                <input tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] h-0 w-0 opacity-0" value={form.website} onChange={set("website")} name="website" />
                {status === "error" && <p role="alert" className="rounded-xl bg-signal/10 p-3 text-sm text-signal">{serverError}</p>}
                <button type="submit" disabled={status === "sending"} className="inline-flex items-center gap-2 rounded-full bg-signal px-8 py-3.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-ember hover:shadow-lg hover:shadow-signal/30 disabled:translate-y-0 disabled:opacity-60 focus-ring">
                  {status === "sending" ? (<><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />Sending…</>) : "Send message"}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
