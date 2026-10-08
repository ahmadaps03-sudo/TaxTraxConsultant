"use client";

import { useRef, useState } from "react";

/**
 * Create-account UI for the Client Portal.
 *
 * Sends a pending access request, not an Auth signup, approval or invitation.
 * No password is collected or transmitted here.
 */

type Key = "name" | "email" | "phone" | "agree";
type Values = { name: string; email: string; phone: string; company: string; agree: boolean };
type Errors = Partial<Record<Key, string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validate(v: Values): Errors {
  const e: Errors = {};
  if (v.name.trim().length < 2) e.name = "Enter your full name.";
  if (!v.email.trim()) e.email = "Email is required.";
  else if (!EMAIL_RE.test(v.email.trim())) e.email = "Enter a valid email address.";
  const digits = v.phone.replace(/\D/g, "");
  if (!v.phone.trim()) e.phone = "Phone number is required.";
  else if (!/^[+\d][\d\s().-]*$/.test(v.phone.trim()) || digits.length < 7 || digits.length > 15) e.phone = "Enter a valid phone number (7 to 15 digits).";
  if (!v.agree) e.agree = "Please confirm so we can contact you.";
  return e;
}

async function sendAccountRequest(v: Values, honeypot: string): Promise<{ ok: boolean; status: number; fields?: Errors; error?: string }> {
  const response = await fetch("/api/portal/access-requests", {
    method: "POST",
    mode: "same-origin",
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    headers: { "Content-Type": "application/json", "X-TaxTrax-Auth": "1" },
    body: JSON.stringify({
      name: v.name.trim(),
      email: v.email.trim(),
      phone: v.phone.trim(),
      company: v.company.trim(),
      contact_consent: v.agree,
      website: honeypot, // honeypot field, must stay empty for real people
    }),
  });
  const result = await response.json().catch(() => null);
  return { ok: response.ok && result?.ok === true, status: response.status, fields: result?.fields, error: typeof result?.error === "string" ? result.error : undefined };
}

export function CreateAccountForm({ onLogin }: { onLogin: () => void }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [dir, setDir] = useState<"fwd" | "back">("fwd");
  const [values, setValues] = useState<Values>({ name: "", email: "", phone: "", company: "", agree: false });
  const [touched, setTouched] = useState<Partial<Record<Key, boolean>>>({});
  const [serverErrors, setServerErrors] = useState<Errors>({});
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shaking, setShaking] = useState(false);
  const submitting = useRef(false);
  const honeypot = useRef<HTMLInputElement>(null);

  const errors = validate(values);
  const shown = (k: Key) => serverErrors[k] ?? (touched[k] ? errors[k] : undefined);
  const set = <K extends keyof Values>(k: K, value: Values[K]) => {
    setValues((current) => ({ ...current, [k]: value }));
    if (k in serverErrors) setServerErrors((current) => ({ ...current, [k as Key]: undefined }));
  };
  const touch = (...keys: Key[]) => setTouched((current) => ({ ...current, ...Object.fromEntries(keys.map((k) => [k, true])) }));
  const shake = () => setShaking(true);

  const next = () => {
    touch("name", "email");
    if (errors.name || errors.email) { shake(); return; }
    setDir("fwd");
    setStep(2);
  };
  const back = () => { setDir("back"); setStep(1); setError(null); };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current) return;
    if (step === 1) { next(); return; }
    touch("name", "email", "phone", "agree");
    if (Object.keys(errors).length) {
      shake();
      if (errors.name || errors.email) { setDir("back"); setStep(1); }
      return;
    }
    submitting.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await sendAccountRequest(values, honeypot.current?.value ?? "");
      if (result.ok) { setDone(true); return; }
      if (result.fields) {
        const mapped: Errors = {};
        for (const k of ["name", "email", "phone", "agree"] as const) if (result.fields[k]) mapped[k] = result.fields[k];
        setServerErrors(mapped);
        if (mapped.name || mapped.email) { setDir("back"); setStep(1); }
      }
      setError(result.status === 429 ? "Too many requests. Please wait a few minutes and try again." : result.error ?? "We couldn't send your request. Please try again.");
      shake();
    } catch {
      setError("We couldn't send your request. Check your connection and try again.");
      shake();
    } finally {
      submitting.current = false;
      setPending(false);
    }
  };

  if (done) return <Success email={values.email.trim()} onLogin={onLogin} />;

  const slide = dir === "fwd" ? "ap-in-right" : "ap-in-left";

  return (
    <div>
      <div className="ap-rise">
        <h1 className="font-serif text-2xl text-paper">Create your account</h1>
        <p className="mt-1 text-sm text-smoke">Request access to your secure TaxTrax client portal.</p>
      </div>

      {/* Progress */}
      <div className="ap-rise mt-5" style={{ animationDelay: "60ms" }} aria-label={`Step ${step} of 2`}>
        <div className="flex gap-2" aria-hidden>
          {[1, 2].map((n) => (
            <div key={n} className="h-1 flex-1 overflow-hidden rounded-full bg-line">
              <div className={`h-full origin-left rounded-full bg-signal transition-transform duration-500 ease-out ${step >= n ? "scale-x-100" : "scale-x-0"}`} />
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-smoke">Step {step} of 2 · <span className="text-paper">{step === 1 ? "About you" : "How to reach you"}</span></p>
      </div>

      <form
        onSubmit={submit} noValidate aria-busy={pending}
        className={`mt-5 space-y-4 ${shaking ? "ap-shake" : ""}`}
        onAnimationEnd={(event) => { if (event.target === event.currentTarget) setShaking(false); }}
      >
        {/* Honeypot: hidden from people, bots fill it in */}
        <input ref={honeypot} type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] h-0 w-0 opacity-0" />

        {step === 1 && (
          <div key="step1" className={`space-y-4 ${slide}`}>
            <Field label="Full name" name="name" autoComplete="name" autoFocus value={values.name} onChange={(x) => set("name", x)} onBlur={() => touch("name")} error={shown("name")} valid={!errors.name} disabled={pending} icon={<UserIcon />} placeholder="e.g. Ayesha Khan" maxLength={100} />
            <Field label="Email address" name="email" type="email" autoComplete="email" inputMode="email" value={values.email} onChange={(x) => set("email", x)} onBlur={() => touch("email")} error={shown("email")} valid={!errors.email} disabled={pending} icon={<MailIcon />} placeholder="you@example.com" maxLength={254} />
            <button type="submit" className="ap-btn focus-ring flex w-full items-center justify-center gap-2 rounded-lg bg-signal px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-ember">
              Continue <ArrowIcon />
            </button>
          </div>
        )}

        {step === 2 && (
          <div key="step2" className={`space-y-4 ${slide}`}>
            <Field label="Phone / WhatsApp" name="phone" type="tel" autoComplete="tel" inputMode="tel" autoFocus value={values.phone} onChange={(x) => set("phone", x)} onBlur={() => touch("phone")} error={shown("phone")} valid={!errors.phone} disabled={pending} icon={<PhoneIcon />} placeholder="+92 300 1234567" maxLength={40} />
            <Field label="Company" optional name="company" autoComplete="organization" value={values.company} onChange={(x) => set("company", x)} disabled={pending} icon={<BuildingIcon />} placeholder="Business name (if any)" maxLength={100} />

            <div>
              <label className="group flex cursor-pointer select-none items-start gap-2.5 text-xs text-smoke">
                <input type="checkbox" checked={values.agree} onChange={(event) => { set("agree", event.target.checked); touch("agree"); }} disabled={pending} className="ap-cb peer sr-only" />
                <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-[4px] border border-line bg-ink transition-all duration-200 group-hover:border-signal peer-checked:border-signal peer-checked:bg-signal peer-focus-visible:ring-2 peer-focus-visible:ring-signal/40">
                  <svg viewBox="0 0 24 24" className="h-3 w-3 text-ink" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7" /></svg>
                </span>
                <span>I agree that TaxTrax may contact me about my portal access and my tax engagement.</span>
              </label>
              <Reveal show={!!shown("agree")}><p role="alert" className="pt-1.5 text-xs text-signal">{shown("agree")}</p></Reveal>
            </div>

            <p className="rounded-lg border border-line bg-charcoal px-3 py-2 text-xs text-smoke">
              <span className="text-paper">No password needed here.</span> Our team verifies each client before activating portal access.
            </p>

            {error && <Alert>{error}</Alert>}

            <div className="flex gap-3">
              <button type="button" onClick={back} disabled={pending} className="focus-ring rounded-lg border border-line px-4 py-2.5 text-sm text-smoke transition-colors hover:border-paper hover:text-paper disabled:opacity-60">Back</button>
              <button type="submit" disabled={pending} className="ap-btn focus-ring flex flex-1 items-center justify-center gap-2 rounded-lg bg-signal px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-ember disabled:opacity-80">
                {pending ? <><Spinner /> Sending request…</> : <>Create account <ArrowIcon /></>}
              </button>
            </div>
          </div>
        )}
      </form>

      <p className="ap-rise mt-5 text-center text-xs text-smoke" style={{ animationDelay: "160ms" }}>
        Already have an account?{" "}
        <button type="button" onClick={onLogin} className="focus-ring text-signal transition-colors hover:text-ember">Log in</button>
      </p>
    </div>
  );
}

function Success({ email, onLogin }: { email: string; onLogin: () => void }) {
  const steps = ["We review your details", "We contact you to activate access", "You log in to your portal"];
  return (
    <div className="ap-fade py-2 text-center" role="status">
      <div className="relative mx-auto grid h-16 w-16 place-items-center">
        <span className="ap-ring absolute inset-0 rounded-full bg-ok/30" aria-hidden />
        <span className="ap-pop grid h-16 w-16 place-items-center rounded-full bg-ok text-ink">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path className="ap-check" d="M5 12.5l4.5 4.5L19 7" /></svg>
        </span>
      </div>
      <h1 className="ap-rise mt-5 font-serif text-2xl text-paper" style={{ animationDelay: "150ms" }}>Request received</h1>
      <p className="ap-rise mx-auto mt-2 max-w-xs text-sm text-smoke" style={{ animationDelay: "220ms" }}>
        Thanks! We&apos;ll reach out to <span className="break-all text-paper">{email}</span> to activate your portal access.
      </p>
      <ol className="mx-auto mt-6 max-w-xs space-y-2 text-left text-sm">
        {steps.map((label, i) => (
          <li key={label} className="ap-rise flex items-center gap-3" style={{ animationDelay: `${300 + i * 90}ms` }}>
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-signal text-xs text-signal">{i + 1}</span>
            <span className="text-paper/85">{label}</span>
          </li>
        ))}
      </ol>
      <button type="button" onClick={onLogin} className="ap-btn ap-rise focus-ring mt-7 w-full rounded-lg bg-signal px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-ember" style={{ animationDelay: "600ms" }}>
        Back to log in
      </button>
    </div>
  );
}

/* ───────── small building blocks ───────── */

function Field(props: {
  label: string; name: string; value: string; onChange: (value: string) => void; onBlur?: () => void;
  type?: string; autoComplete?: string; inputMode?: "email" | "tel" | "text"; placeholder?: string; maxLength?: number;
  autoFocus?: boolean; disabled?: boolean; optional?: boolean; error?: string; valid?: boolean; icon: React.ReactNode;
}) {
  const { label, name, value, onChange, onBlur, error, valid, icon, optional, ...input } = props;
  const id = `ca-${name}`;
  return (
    <div>
      <label htmlFor={id} className="flex items-baseline justify-between text-xs text-smoke">
        <span>{label}</span>{optional && <span className="text-[11px] opacity-70">Optional</span>}
      </label>
      <div className="group relative mt-1">
        <span className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 transition-colors duration-200 ${error ? "text-signal" : "text-smoke group-focus-within:text-signal"}`}>{icon}</span>
        <input
          id={id} name={name} value={value} onChange={(event) => onChange(event.target.value)} onBlur={onBlur}
          aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined}
          {...input}
          className={`w-full rounded-lg border bg-charcoal py-2.5 pl-9 pr-9 text-sm text-paper outline-none transition-all duration-200 placeholder:text-smoke/60 focus:bg-ink focus:shadow-[0_0_0_3px_rgba(255,4,4,0.12)] ${error ? "border-signal" : "border-line focus:border-signal"}`}
        />
        {!error && valid && value && !optional && (
          <svg key="ok" className="ap-pop absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ok" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7" /></svg>
        )}
      </div>
      <Reveal show={!!error}><p id={`${id}-error`} role="alert" className="pt-1.5 text-xs text-signal">{error}</p></Reveal>
    </div>
  );
}

/** Smoothly expands/collapses its child (no layout jump when an error appears). */
function Reveal({ show, children }: { show: boolean; children: React.ReactNode }) {
  return (
    <div className={`grid transition-all duration-300 ease-out ${show ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
      <div className="overflow-hidden">{children}</div>
    </div>
  );
}

function Alert({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="ap-rise flex items-start gap-2 rounded-lg border border-signal/30 bg-cream px-3 py-2 text-sm text-signal">
      <svg className="mt-0.5 shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16.5v.01" strokeLinecap="round" /></svg>
      <span>{children}</span>
    </p>
  );
}

const svgProps = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;
const UserIcon = () => <svg {...svgProps}><circle cx="12" cy="8" r="4" /><path d="M4 20c1.5-4 5-5 8-5s6.5 1 8 5" /></svg>;
const MailIcon = () => <svg {...svgProps}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3.5 7l8.5 6 8.5-6" /></svg>;
const PhoneIcon = () => <svg {...svgProps}><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" /></svg>;
const BuildingIcon = () => <svg {...svgProps}><path d="M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16M14 10h5a1 1 0 0 1 1 1v10M3 21h18M8 8h2M8 12h2M8 16h2" /></svg>;
const ArrowIcon = () => <svg {...svgProps} width={14} height={14} strokeWidth={2.2}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
const Spinner = () => <svg className="ap-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden><path d="M12 3a9 9 0 1 0 9 9" /></svg>;
