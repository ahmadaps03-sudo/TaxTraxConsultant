"use client";

import { useState } from "react";
import { validateBooking } from "@/lib/validation";
import { services } from "@/lib/data";

const STEPS = ["Select Service", "Pre-Qualification", "Pick Date & Time", "Confirmation"];

const TIMESLOTS = ["10:00 AM", "11:30 AM", "1:00 PM", "3:00 PM", "4:30 PM"];

export default function BookConsultationPage() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    service: "",
    revenue: "",
    timeline: "",
    date: "",
    time: "",
    name: "",
    email: "",
    phone: "",
  });

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = validateBooking(form);
    if (!v.ok) { setFieldErrors(v.fields); setError("Please fill in your name, email and phone number."); return; }
    setBusy(true);
    setError("");
    setFieldErrors({});
    try {
      const res = await fetch("/api/bookings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) { const j = await res.json().catch(() => ({})); if (j.fields) setFieldErrors(j.fields); throw new Error(j.error || "Something went wrong"); }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not book. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-5 py-16">
      <h1 className="font-serif text-3xl text-paper sm:text-4xl">Book a Consultation</h1>
      <p className="mt-3 text-sm text-smoke">Schedule a call with our tax experts. It's quick, easy and free.</p>

      {/* Progress */}
      <div className="mt-8 flex items-center gap-2">
        {STEPS.map((label, i) => (
          <div key={label} className="flex flex-1 items-center gap-2">
            <div className={`flex h-7 w-7 shrink-0 items-center justify-center border text-xs ${i <= step ? "border-signal bg-signal text-ink" : "border-line text-smoke"}`}>
              {i + 1}
            </div>
            {i < STEPS.length - 1 && <div className={`h-px flex-1 ${i < step ? "bg-signal" : "bg-line"}`} />}
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-smoke">Step {step + 1} of {STEPS.length}: {STEPS[step]}</p>

      <div className="card-flat mt-6 p-6 sm:p-6">
        {step === 0 && (
          <div className="space-y-4">
            <p className="text-sm text-paper/80">What would you like to discuss?</p>
            <div className="grid gap-2">
              {services.map((s) => (
                <label key={s.slug} className={`flex cursor-pointer items-center gap-3 border p-3 text-sm transition-colors ${form.service === s.slug ? "border-signal bg-ink" : "border-line"}`}>
                  <input type="radio" name="service" checked={form.service === s.slug} onChange={() => setForm({ ...form, service: s.slug })} className="accent-signal" />
                  {s.title}
                </label>
              ))}
            </div>
            <StepNav onNext={next} nextDisabled={!form.service} />
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <label className="block">
              <span className="text-xs text-smoke">Annual business revenue</span>
              <select value={form.revenue} onChange={(e) => setForm({ ...form, revenue: e.target.value })} className="mt-1 w-full border border-line bg-charcoal px-3 py-2 text-sm text-paper focus-ring focus:border-signal">
                <option value="">Select a range</option>
                <option>PKR 0 – 5M</option>
                <option>PKR 5M – 50M</option>
                <option>PKR 50M+</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-smoke">Desired timeline</span>
              <select value={form.timeline} onChange={(e) => setForm({ ...form, timeline: e.target.value })} className="mt-1 w-full border border-line bg-charcoal px-3 py-2 text-sm text-paper focus-ring focus:border-signal">
                <option value="">Select a timeline</option>
                <option>Immediately</option>
                <option>Within 1 month</option>
                <option>Just exploring</option>
              </select>
            </label>
            <StepNav onBack={back} onNext={next} nextDisabled={!form.revenue || !form.timeline} />
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <label className="block">
              <span className="text-xs text-smoke">Date</span>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="mt-1 w-full border border-line bg-charcoal px-3 py-2 text-sm text-paper focus-ring focus:border-signal" />
            </label>
            <div>
              <span className="text-xs text-smoke">Available times</span>
              <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
                {TIMESLOTS.map((t) => (
                  <button
                    key={t} type="button" onClick={() => setForm({ ...form, time: t })}
                    className={`px-2 py-2 text-xs transition-colors focus-ring ${form.time === t ? "bg-signal text-ink" : "border border-line text-smoke hover:text-paper hover:border-signal"}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-xs text-smoke">TODO(backend): replace this static grid with live availability from the chosen calendar tool.</p>
            <StepNav onBack={back} onNext={() => setStep(3)} nextDisabled={!form.date || !form.time} nextIsFinal />
          </div>
        )}

        {step === 3 && !done && (
          <form onSubmit={confirm} noValidate className="space-y-5">
            <p className="text-sm text-paper/80">Almost done — where should we send the confirmation?</p>
            <Field label="Full name *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} error={fieldErrors.name} autoComplete="name" />
            <Field label="Email *" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} error={fieldErrors.email} autoComplete="email" />
            <Field label="Phone / WhatsApp *" type="tel" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} error={fieldErrors.phone} autoComplete="tel" />
            {error && <p role="alert" className="text-sm text-signal">{error}</p>}
            <div className="flex gap-3">
              <button type="button" onClick={back} className="border border-line px-5 py-2.5 text-sm text-paper hover:border-signal focus-ring">Back</button>
              <button type="submit" disabled={busy} className="bg-signal px-5 py-2.5 text-sm font-medium text-ink hover:bg-ember transition-colors focus-ring disabled:opacity-60">{busy ? "Booking…" : "Confirm booking"}</button>
            </div>
          </form>
        )}

        {step === 3 && done && (
          <div className="text-center">
            <p className="font-serif text-2xl text-ok">Booking confirmed.</p>
            <p className="mt-3 text-sm text-paper/80">
              {form.date} at {form.time} — a calendar invite with a Zoom/Meet link is on its way to {form.email}.
            </p>
            
          </div>
        )}
      </div>
    </div>
  );
}

function StepNav({ onBack, onNext, nextDisabled, nextIsFinal }: { onBack?: () => void; onNext: () => void; nextDisabled?: boolean; nextIsFinal?: boolean }) {
  return (
    <div className="flex gap-3 pt-2">
      {onBack && <button type="button" onClick={onBack} className="border border-line px-5 py-2.5 text-sm text-paper hover:border-signal focus-ring">Back</button>}
      <button type="button" onClick={onNext} disabled={nextDisabled} className="bg-signal px-5 py-2.5 text-sm font-medium text-ink hover:bg-ember transition-colors disabled:opacity-40 disabled:hover:bg-signal focus-ring">
        {nextIsFinal ? "Continue" : "Next"}
      </button>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", error, autoComplete }: { label: string; value: string; onChange: (v: string) => void; type?: string; error?: string; autoComplete?: string }) {
  return (
    <label className="block">
      <span className="text-xs text-smoke">{label}</span>
      <input type={type} autoComplete={autoComplete} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error}
        className={`mt-1 w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-paper focus:outline-none focus:ring-4 ${error ? "border-signal focus:ring-signal/15" : "border-line focus:border-signal focus:ring-signal/10"}`} />
      {error && <span role="alert" className="mt-1 block text-xs text-signal">{error}</span>}
    </label>
  );
}
