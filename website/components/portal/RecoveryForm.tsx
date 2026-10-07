"use client";

import { useRef, useState } from "react";

export function RecoveryForm({ mode, invalid = false }: { mode: "request" | "verify" | "password"; invalid?: boolean }) {
  const [stage, setStage] = useState(mode);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(invalid ? "This recovery link is invalid or has expired. Request a new link." : null);
  const submitting = useRef(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError(null);
    const fields = new FormData(event.currentTarget);
    const body = stage === "request" ? { email: fields.get("email") }
      : stage === "password" ? { password: fields.get("password"), confirm: fields.get("confirm") } : {};
    try {
      const response = await fetch(`/api/auth/recovery/${stage}`, {
        method: "POST", mode: "same-origin", credentials: "same-origin", cache: "no-store", redirect: "error",
        headers: { "Content-Type": "application/json", "X-TaxTrax-Auth": "1" }, body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => null);
      if (response.ok && result?.ok === true) {
        if (stage === "request") setSent(true);
        else if (stage === "verify") setStage("password");
        else { window.location.replace("/portal"); return; }
      } else setError(typeof result?.error === "string" ? result.error : "Password recovery is temporarily unavailable. Please try again.");
    } catch { setError("Password recovery is temporarily unavailable. Please try again."); }
    submitting.current = false;
    setPending(false);
  };

  return (
    <div className="mx-auto max-w-lg px-5 py-10">
      <div className="card-flat p-6">
        <h1 className="font-serif text-2xl text-paper">{stage === "request" ? "Forgot password?" : "Reset password"}</h1>
        {sent ? <p role="status" className="mt-4 text-sm text-smoke">If an account can receive a recovery email, a link will be sent. Check your inbox and spam folder.</p> : (
          <form onSubmit={submit} className="mt-6 space-y-4" aria-busy={pending}>
            {stage === "request" && <label className="block">
              <span className="text-xs text-smoke">Email</span>
              <input name="email" type="email" autoComplete="email" required maxLength={254} disabled={pending} className="mt-1 w-full border border-line bg-charcoal px-3 py-2 text-sm text-paper focus-ring" />
            </label>}
            {stage === "verify" && <p className="text-sm text-smoke">Continue to verify your recovery link. This does not sign you into the Client Portal.</p>}
            {stage === "password" && <>
              <p className="text-sm text-smoke">Use 10–128 characters, including a letter and a number. Avoid common passwords, your email and your name. All sessions are signed out after a successful reset.</p>
              {[["password", "New password"], ["confirm", "Confirm new password"]].map(([name, label]) => <label key={name} className="block">
                <span className="text-xs text-smoke">{label}</span>
                <input name={name} type="password" autoComplete="new-password" required minLength={10} maxLength={128} disabled={pending} className="mt-1 w-full border border-line bg-charcoal px-3 py-2 text-sm text-paper focus-ring" />
              </label>)}
            </>}
            {error && <p role="alert" className="text-sm text-signal">{error}</p>}
            <button type="submit" disabled={pending || (invalid && stage === "verify")} className="w-full bg-signal px-4 py-2.5 text-sm font-medium text-ink hover:bg-ember focus-ring">
              {pending ? "Please wait…" : stage === "request" ? "Send recovery email" : stage === "verify" ? "Continue" : "Update password"}
            </button>
          </form>
        )}
        <div className="mt-6 flex justify-between text-xs">
          <a href="/portal" className="text-signal hover:text-ember">Back to login</a>
          {stage !== "request" && <a href="/portal/forgot-password" className="text-signal hover:text-ember">Request a new link</a>}
        </div>
      </div>
    </div>
  );
}
