"use client";

import { useRef, useState } from "react";

export function ActivationForm({ mode, invalid = false }: { mode: "verify" | "password"; invalid?: boolean }) {
  const [stage, setStage] = useState(mode);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(invalid ? "This invitation is invalid or has expired. Contact the TaxTrax team." : null);
  const submitting = useRef(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError(null);
    const fields = new FormData(event.currentTarget);
    const body = stage === "password" ? { password: fields.get("password"), confirm: fields.get("confirm") } : {};
    try {
      const response = await fetch(`/api/auth/activation/${stage}`, {
        method: "POST", mode: "same-origin", credentials: "same-origin", cache: "no-store", redirect: "error",
        headers: { "Content-Type": "application/json", "X-TaxTrax-Auth": "1" }, body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => null);
      if (response.ok && result?.ok === true) {
        if (stage === "verify") setStage("password");
        else { window.location.replace("/portal"); return; }
      } else setError(typeof result?.error === "string" ? result.error : "Account setup is temporarily unavailable. Please try again.");
    } catch { setError("Account setup is temporarily unavailable. Please try again."); }
    submitting.current = false;
    setPending(false);
  };

  return (
    <div className="mx-auto max-w-lg px-5 py-10">
      <div className="card-flat p-6">
        <h1 className="font-serif text-2xl text-paper">Set up your account</h1>
        <form onSubmit={submit} className="mt-6 space-y-4" aria-busy={pending}>
          {stage === "verify" ? <p className="text-sm text-smoke">Use your invitation email, then continue to verify it. This does not sign you into the Client Portal.</p> : <>
            <p className="text-sm text-smoke">Choose your first password: 10–128 characters, including a letter and a number. Avoid common passwords, your email and your name. You will need to log in after setup.</p>
            {[["password", "First password"], ["confirm", "Confirm password"]].map(([name, label]) => <label key={name} className="block">
              <span className="text-xs text-smoke">{label}</span>
              <input name={name} type="password" autoComplete="new-password" required minLength={10} maxLength={128} disabled={pending} className="mt-1 w-full border border-line bg-charcoal px-3 py-2 text-sm text-paper focus-ring" />
            </label>)}
          </>}
          {error && <p role="alert" className="text-sm text-signal">{error}</p>}
          <button type="submit" disabled={pending || (invalid && stage === "verify")} className="w-full bg-signal px-4 py-2.5 text-sm font-medium text-ink hover:bg-ember focus-ring">
            {pending ? "Please wait…" : stage === "verify" ? "Continue" : "Set password"}
          </button>
        </form>
        <p className="mt-6 text-xs text-smoke">Need a new invitation? Contact the TaxTrax team.</p>
        <a href="/portal" className="mt-3 inline-block text-xs text-signal hover:text-ember">Back to login</a>
      </div>
    </div>
  );
}
