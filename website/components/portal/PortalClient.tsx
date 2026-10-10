"use client";

import { useEffect, useRef, useState } from "react";
import { CreateAccountForm } from "./CreateAccountForm";

const logoutFailure = "Unable to confirm sign-out. Please try again.";

/* "Remember me" is purely a browser convenience: it stores ONLY the email address (never the password)
   in this device's localStorage so the field is pre-filled next time. It sends nothing extra to the
   backend and does not change how long the server session lasts. */
const REMEMBER_KEY = "taxtrax.portal.email";
const readRemembered = () => { try { return window.localStorage.getItem(REMEMBER_KEY) ?? ""; } catch { return ""; } };
const writeRemembered = (email: string | null) => {
  try { if (email) window.localStorage.setItem(REMEMBER_KEY, email); else window.localStorage.removeItem(REMEMBER_KEY); } catch {}
};

function usePortalHistory() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const hide = () => { root.current?.style.setProperty("visibility", "hidden"); };
    const revalidate = () => { hide(); window.location.reload(); };
    const show = (event: PageTransitionEvent) => { if (event.persisted) revalidate(); };
    const leave = (event: PageTransitionEvent) => { if (event.persisted) hide(); };
    const back = () => { if (window.location.pathname === "/portal") revalidate(); };
    window.addEventListener("pageshow", show);
    window.addEventListener("pagehide", leave);
    window.addEventListener("popstate", back);
    return () => {
      window.removeEventListener("pageshow", show);
      window.removeEventListener("pagehide", leave);
      window.removeEventListener("popstate", back);
    };
  }, []);
  return root;
}

async function submitAuth(endpoint: "login" | "logout", body: { email: string; password: string } | Record<string, never>) {
  const response = await fetch(`/api/auth/${endpoint}`, {
    method: "POST",
    mode: "same-origin",
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    headers: { "Content-Type": "application/json", "X-TaxTrax-Auth": "1" },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => null);
  return { success: response.ok && result?.ok === true, status: response.status };
}


const CHECKLIST = [
  { label: "Upload 2025 W-2 / salary certificate", status: "Completed" as const },
  { label: "Review & sign engagement letter", status: "Pending" as const },
  { label: "Review draft return & e-sign", status: "Needs Action" as const },
];

const DOCUMENTS = [
  { name: "W-2_2026.pdf", tag: "W-2", date: "Jan 15, 2026" },
  { name: "1099-INT.pdf", tag: "1099", date: "Jan 12, 2026" },
  { name: "Business_Expenses.xlsx", tag: "Expenses", date: "Jan 5, 2026" },
];

type View = "login" | "signup";
const SIGNUP_HASH = "#create-account";

export function PortalLogin({ logoutUnconfirmed = false }: { logoutUnconfirmed?: boolean }) {
  const root = usePortalHistory();
  const [view, setView] = useState<View>("login");
  const [dir, setDir] = useState<"fwd" | "back">("fwd");
  const [email, setEmail] = useState("");
  const [remember, setRemember] = useState(false);
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [shaking, setShaking] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [error, setError] = useState<string | null>(logoutUnconfirmed ? logoutFailure : null);
  const submitting = useRef(false);

  // Pre-fill a remembered email, and open straight on "Create account" for /portal#create-account links.
  useEffect(() => {
    const saved = readRemembered();
    if (saved) { setEmail(saved); setRemember(true); }
    if (window.location.hash === SIGNUP_HASH) setView("signup");
  }, []);

  const go = (next: View) => {
    if (next === view || pending) return;
    setDir(next === "signup" ? "fwd" : "back");
    setView(next);
    setError(null);
    window.history.replaceState(null, "", next === "signup" ? SIGNUP_HASH : window.location.pathname + window.location.search);
  };

  const login = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current) return;
    const password = new FormData(event.currentTarget).get("password");
    if (typeof password !== "string") { setError("Unable to sign in."); setShaking(true); return; }
    submitting.current = true;
    setPending(true);
    setError(null);
    let navigating = false;
    try {
      const result = await submitAuth("login", { email, password });
      if (result.success) {
        navigating = true;
        writeRemembered(remember ? email.trim() : null);
        setSuccess(true);
        // Brief success animation, then the same full-page navigation as before so the server re-checks authorization.
        window.setTimeout(() => window.location.replace("/portal"), 750);
      } else {
        setError([400, 401].includes(result.status) ? "Unable to sign in." : "Unable to sign in right now. Please try again.");
        setShaking(true);
      }
    } catch {
      setError("Unable to sign in right now. Please try again.");
      setShaking(true);
    } finally {
      if (!navigating) { submitting.current = false; setPending(false); }
    }
  };

  return (
    <div ref={root} className="mx-auto grid min-h-[70vh] max-w-5xl gap-0 px-5 py-16 lg:grid-cols-2">
      {/* Left: brand + security reassurance */}
      <div className="card-flat ap-rise relative flex flex-col justify-center gap-6 overflow-hidden border-r-0 p-6 lg:rounded-r-none lg:border-r lg:border-line">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-signal/5" aria-hidden />
        <div className="relative">
          <div className="flex items-center gap-2 font-serif text-xl text-paper">
            <span className="inline-block h-6 w-2 bg-signal" aria-hidden /> TaxTrax Consulting
          </div>
          <div className="ap-float relative mt-6 grid h-14 w-14 place-items-center" aria-hidden>
            <span className="ap-ring absolute inset-0 rounded-full bg-signal/25" />
            <span className="ap-ring absolute inset-0 rounded-full bg-signal/25" style={{ animationDelay: "1.4s" }} />
            <span className="relative grid h-14 w-14 place-items-center rounded-full bg-signal text-ink"><ShieldIcon /></span>
          </div>
          <p className="mt-5 text-sm text-smoke">{view === "login" ? "Secure Client Portal" : "Join the Client Portal"}</p>
          <p className="mt-2 max-w-sm text-2xl font-serif text-paper">Your financial data is fully encrypted and secure.</p>
        </div>
        <div className="relative grid grid-cols-3 gap-3 border-t border-line pt-6 text-center text-xs text-smoke">
          <Badge label="256-bit SSL Encryption" delay={200} />
          <Badge label="SOC 2 Type II" delay={300} />
          <Badge label="IRS e-File Standard" delay={400} />
        </div>
      </div>

      {/* Right: login / create account */}
      <div className="card-flat ap-rise border-t-0 p-6 lg:rounded-l-none lg:border-t lg:border-l-0" style={{ animationDelay: "80ms" }}>
        {/* Animated Log in / Create account switch */}
        <div role="tablist" aria-label="Portal access" className="relative mb-6 grid grid-cols-2 rounded-lg bg-charcoal p-1 text-sm">
          <span
            aria-hidden
            className="absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-md bg-ink shadow-sm transition-transform duration-300 ease-out"
            style={{ transform: view === "signup" ? "translateX(100%)" : "translateX(0)" }}
          />
          {([["login", "Log in"], ["signup", "Create account"]] as const).map(([id, label]) => (
            <button
              key={id} type="button" role="tab" aria-selected={view === id} onClick={() => go(id)} disabled={pending}
              className={`focus-ring relative z-10 rounded-md py-2 transition-colors duration-200 ${view === id ? "text-paper" : "text-smoke hover:text-paper"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {view === "signup" ? (
          <div key="signup" className={dir === "fwd" ? "ap-in-right" : "ap-in-left"}>
            <CreateAccountForm onLogin={() => go("login")} />
          </div>
        ) : (
          <div key="login" className={dir === "back" ? "ap-in-left" : "ap-in-right"}>
            <h1 className="font-serif text-2xl text-paper">Client Portal Login</h1>
            <p className="mt-1 text-sm text-smoke">Access your secure TaxTrax account.</p>

            <form
              onSubmit={login} className={`mt-6 space-y-4 ${shaking ? "ap-shake" : ""}`} aria-busy={pending}
              onAnimationEnd={(event) => { if (event.target === event.currentTarget) setShaking(false); }}
            >
              <label className="ap-rise block" style={{ animationDelay: "120ms" }}>
                <span className="text-xs text-smoke">Email or username</span>
                <div className="group relative mt-1">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-smoke transition-colors duration-200 group-focus-within:text-signal"><MailIcon /></span>
                  <input
                    name="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required disabled={pending}
                    className="w-full rounded-lg border border-line bg-charcoal py-2.5 pl-9 pr-3 text-sm text-paper outline-none transition-all duration-200 focus:border-signal focus:bg-ink focus:shadow-[0_0_0_3px_rgba(255,4,4,0.12)] disabled:opacity-70"
                  />
                </div>
              </label>

              <div className="ap-rise" style={{ animationDelay: "190ms" }}>
                <PasswordField disabled={pending} capsLock={capsLock} onCapsLock={setCapsLock} />
              </div>

              <div className="ap-rise" style={{ animationDelay: "260ms" }}>
                <div className="flex items-center justify-between text-xs text-smoke">
                  <label className="group flex cursor-pointer select-none items-center gap-2" title="Remember my email on this device">
                    <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} disabled={pending} className="ap-cb peer sr-only" />
                    <span className="grid h-4 w-4 place-items-center rounded-[4px] border border-line bg-ink transition-all duration-200 group-hover:border-signal peer-checked:border-signal peer-checked:bg-signal peer-focus-visible:ring-2 peer-focus-visible:ring-signal/40">
                      <svg viewBox="0 0 24 24" className="h-3 w-3 text-ink" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7" /></svg>
                    </span>
                    Remember me
                  </label>
                  <a href="/portal/forgot-password" className="text-signal transition-colors hover:text-ember">Forgot password?</a>
                </div>
                <div className={`grid transition-all duration-300 ease-out ${remember ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                  <p className="overflow-hidden pt-2 text-[11px] text-smoke">We&apos;ll remember your email on this device only. Your password is never saved.</p>
                </div>
              </div>

              {error && (
                <p role="alert" className="ap-rise flex items-start gap-2 rounded-lg border border-signal/30 bg-cream px-3 py-2 text-sm text-signal">
                  <svg className="mt-0.5 shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16.5v.01" strokeLinecap="round" /></svg>
                  <span>{error}</span>
                </p>
              )}

              <button
                type="submit" disabled={pending}
                className={`ap-btn ap-rise focus-ring flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-ink transition-colors duration-300 ${success ? "bg-ok" : "bg-signal hover:bg-ember"} disabled:cursor-wait`}
                style={{ animationDelay: "330ms" }}
              >
                {success ? <><CheckIcon /> Welcome back</> : pending ? <><SpinnerIcon /> Signing in…</> : <><LockIcon /> Log In to Secure Portal</>}
              </button>

              <div className="ap-rise flex items-center justify-between text-xs" style={{ animationDelay: "400ms" }}>
                <span className="text-smoke">First-time user? Use the invitation email from TaxTrax to set up your account.</span>
                <a href="/contact" className="text-smoke transition-colors hover:text-paper">Need help?</a>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

function PasswordField({ disabled, capsLock, onCapsLock }: { disabled: boolean; capsLock: boolean; onCapsLock: (on: boolean) => void }) {
  const [show, setShow] = useState(false);
  return (
    <label className="block">
      <span className="text-xs text-smoke">Password</span>
      <div className="group relative mt-1">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-smoke transition-colors duration-200 group-focus-within:text-signal"><LockIcon /></span>
        <input
          name="password" autoComplete="current-password" type={show ? "text" : "password"} required disabled={disabled}
          onKeyUp={(event) => onCapsLock(event.getModifierState("CapsLock"))}
          onBlur={() => onCapsLock(false)}
          className="w-full rounded-lg border border-line bg-charcoal py-2.5 pl-9 pr-16 text-sm text-paper outline-none transition-all duration-200 focus:border-signal focus:bg-ink focus:shadow-[0_0_0_3px_rgba(255,4,4,0.12)] disabled:opacity-70"
        />
        <button
          type="button" onClick={() => setShow((visible) => !visible)} aria-pressed={show}
          className="focus-ring absolute right-2 top-1/2 -translate-y-1/2 rounded px-1.5 py-0.5 text-xs text-smoke transition-colors hover:text-signal"
        >
          {show ? "Hide" : "Show"}
        </button>
      </div>
      <div className={`grid transition-all duration-300 ease-out ${capsLock ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
        <p className="overflow-hidden pt-1.5 text-[11px] text-signal" role="status">Caps Lock is on.</p>
      </div>
    </label>
  );
}

function Badge({ label, delay = 0 }: { label: string; delay?: number }) {
  return (
    <div className="ap-rise rounded-lg border border-line p-3 transition-all duration-300 hover:-translate-y-0.5 hover:border-signal hover:shadow-sm" style={{ animationDelay: `${delay}ms` }}>
      <p>{label}</p>
    </div>
  );
}

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="4" y="11" width="16" height="9" rx="1.5" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3.5 7l8.5 6 8.5-6" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3z" /><path className="ap-check" d="M9 12l2.2 2.2L15.5 10" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg className="ap-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden>
      <path d="M12 3a9 9 0 1 0 9 9" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path className="ap-check" d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  );
}

const NAV = ["Dashboard", "Documents", "Checklist", "E-Signature", "Billing & Payments", "Tax Years", "Profile"];

export function PortalDashboard({ name, logoutUnconfirmed = false }: { name: string; logoutUnconfirmed?: boolean }) {
  const root = usePortalHistory();
  const [active, setActive] = useState("Dashboard");
  const [pending, setPending] = useState(false);
  const [signedOut, setSignedOut] = useState(false);
  const [error, setError] = useState<string | null>(logoutUnconfirmed ? logoutFailure : null);
  const submitting = useRef(false);

  const logout = async () => {
    if (submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await submitAuth("logout", {});
      if (result.success) {
        setSignedOut(true); // show the "Signed out" confirmation briefly, then reload so the server re-checks authorization
        window.setTimeout(() => window.location.replace("/portal"), 900);
        return;
      }
    } catch {}
    setError(logoutFailure);
    window.location.replace("/portal?logout=unconfirmed");
  };

  return (
    <div ref={root} className="mx-auto flex max-w-[1200px] gap-8 px-5 py-10">
      {pending && <SignOutOverlay done={signedOut} />}
      <aside className="ap-in-left hidden w-56 shrink-0 border-r border-line pr-6 lg:block">
        <div className="mb-8 flex items-center gap-2 font-serif text-lg text-paper">
          <span className="inline-block h-5 w-1.5 bg-signal" aria-hidden /> TaxTrax
        </div>
        <nav className="space-y-1">
          {NAV.map((item) => (
            <button
              key={item} onClick={() => setActive(item)}
              className={`block w-full px-3 py-2 text-left text-sm transition-colors focus-ring ${active === item ? "bg-signal text-ink" : "text-smoke hover:text-paper"}`}
            >
              {item}
            </button>
          ))}
        </nav>
        <button onClick={logout} disabled={pending} className="group mt-8 text-sm text-smoke transition-colors hover:text-signal"><span className="inline-block transition-transform duration-200 group-hover:-translate-x-1">←</span> {pending ? "Signing out…" : "Log out"}</button>
      </aside>

      <div className="flex-1">
        <div className="ap-rise flex items-center justify-between">
          <div>
            <h1 className="font-serif text-2xl text-paper">Welcome, {name}</h1>
            <p className="text-sm text-smoke">Here's an overview of your tax account.</p>
          </div>
          <button onClick={logout} disabled={pending} className="text-sm text-smoke hover:text-signal lg:hidden">{pending ? "Signing out…" : "Log out"}</button>
        </div>

        {error && <p role="alert" className="mt-4 text-sm text-signal">{error}</p>}

        {active === "Dashboard" && (
          <>
            <div className="mt-6 grid grid-cols-3 gap-4">
              <Stat label="Tax year" value="2025 · In progress" delay={80} />
              <Stat label="Pending tasks" value="3" delay={160} />
              <Stat label="Documents awaiting review" value="2" delay={240} />
            </div>

            <div className="mt-8 grid gap-6 lg:grid-cols-2">
              <div className="card-flat ap-rise p-6" style={{ animationDelay: "300ms" }}>
                <h2 className="font-serif text-lg text-paper">Document upload</h2>
                <div className="mt-4 flex h-32 flex-col items-center justify-center border border-dashed border-line text-center text-sm text-smoke">
                  <p>Drag and drop your files here</p>
                  <p className="text-xs">PDF, JPG, Excel (max 25 MB)</p>
                </div>
                <p className="mt-3 text-xs text-smoke">TODO(backend): wire to Vercel Blob or Cloudinary upload + a Document model tagged by tax year.</p>

                <h3 className="mt-6 text-sm font-medium text-paper">Recent documents</h3>
                <ul className="mt-2 divide-y divide-line">
                  {DOCUMENTS.map((document) => (
                    <li key={document.name} className="flex items-center justify-between py-2 text-sm">
                      <span className="text-paper/85">{document.name}</span>
                      <span className="text-xs text-smoke">{document.tag} · {document.date}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="card-flat ap-rise p-6" style={{ animationDelay: "380ms" }}>
                <h2 className="font-serif text-lg text-paper">Your checklist</h2>
                <ul className="mt-4 space-y-3">
                  {CHECKLIST.map((item) => (
                    <li key={item.label} className="flex items-center justify-between border-b border-line pb-3 last:border-0 text-sm">
                      <span className="text-paper/85">{item.label}</span>
                      <StatusPill status={item.status} />
                    </li>
                  ))}
                </ul>

                <h3 className="mt-6 text-sm font-medium text-paper">Upcoming appointments</h3>
                <p className="mt-2 text-sm text-smoke">No upcoming appointments.</p>
                <a href="/book-consultation" className="mt-3 inline-block bg-signal px-4 py-2 text-sm font-medium text-ink hover:bg-ember transition-colors focus-ring">
                  Book a consultation
                </a>
              </div>
            </div>
          </>
        )}

        {active !== "Dashboard" && (
          <div className="card-flat mt-8 p-7 text-center text-sm text-smoke">
            {active} — connects to the backend once the client data model and storage are wired up.
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, delay = 0 }: { label: string; value: string; delay?: number }) {
  return (
    <div className="ap-rise rounded-lg border border-line p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-signal hover:shadow-sm" style={{ animationDelay: `${delay}ms` }}>
      <p className="text-xs text-smoke">{label}</p>
      <p className="mt-1 font-serif text-lg text-paper">{value}</p>
    </div>
  );
}

function StatusPill({ status }: { status: "Completed" | "Pending" | "Needs Action" }) {
  const styles = {
    Completed: "text-ok border-ok",
    Pending: "text-smoke border-line",
    "Needs Action": "text-signal border-signal",
  } as const;
  return <span className={`border px-2 py-0.5 text-xs ${styles[status]}`}>{status}</span>;
}

function SignOutOverlay({ done }: { done: boolean }) {
  return (
    <div className="ap-fade fixed inset-0 z-50 grid place-items-center bg-ink/80 backdrop-blur-sm" role="status" aria-live="polite">
      <div className="ap-pop card-flat flex w-72 flex-col items-center gap-3 p-8 text-center">
        <div className={`grid h-12 w-12 place-items-center rounded-full text-ink transition-colors duration-300 ${done ? "bg-ok" : "bg-signal"}`}>
          {done ? (
            <svg key="done" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path className="ap-check" d="M5 12.5l4.5 4.5L19 7" /></svg>
          ) : (
            <svg className="ap-spin" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden><path d="M12 3a9 9 0 1 0 9 9" /></svg>
          )}
        </div>
        <p className="font-serif text-lg text-paper">{done ? "You're signed out" : "Signing you out…"}</p>
        <p className="text-xs text-smoke">{done ? "See you soon. Redirecting to login…" : "Securely ending your session."}</p>
      </div>
    </div>
  );
}
