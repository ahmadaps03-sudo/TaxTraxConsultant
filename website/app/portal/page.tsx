"use client";

import { useState } from "react";

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

export default function ClientPortalPage() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [name, setName] = useState("");

  const login = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO(backend): replace with real credential check (NextAuth Credentials
    // provider or custom JWT) + a mandatory 2FA step on first login as noted
    // in the spec. This is local UI state only.
    setLoggedIn(true);
  };

  if (loggedIn) return <PortalDashboard name={name || "Client"} onLogout={() => setLoggedIn(false)} />;

  return (
    <div className="mx-auto grid min-h-[70vh] max-w-5xl gap-0 px-5 py-16 lg:grid-cols-2">
      {/* Left: brand + security reassurance */}
      <div className="card-flat flex flex-col justify-center gap-6 border-r-0 p-6 lg:border-r lg:border-line">
        <div>
          <div className="flex items-center gap-2 font-serif text-xl text-paper">
            <span className="inline-block h-6 w-2 bg-signal" aria-hidden /> TaxTrax Consulting
          </div>
          <p className="mt-4 text-sm text-smoke">Secure Client Portal</p>
          <p className="mt-2 max-w-sm text-2xl font-serif text-paper">Your financial data is fully encrypted and secure.</p>
        </div>
        <div className="grid grid-cols-3 gap-3 border-t border-line pt-6 text-center text-xs text-smoke">
          <Badge label="256-bit SSL Encryption" />
          <Badge label="SOC 2 Type II" />
          <Badge label="IRS e-File Standard" />
        </div>
      </div>

      {/* Right: login form */}
      <div className="card-flat border-t-0 p-6 lg:border-t lg:border-l-0">
        <h1 className="font-serif text-2xl text-paper">Client Portal Login</h1>
        <p className="mt-1 text-sm text-smoke">Access your secure TaxTrax account.</p>

        <form onSubmit={login} className="mt-6 space-y-4">
          <label className="block">
            <span className="text-xs text-smoke">Email or username</span>
            <input
              value={name} onChange={(e) => setName(e.target.value)} required
              className="mt-1 w-full border border-line bg-charcoal px-3 py-2 text-sm text-paper focus-ring focus:border-signal"
            />
          </label>
          <PasswordField />
          <div className="flex items-center justify-between text-xs text-smoke">
            <label className="flex items-center gap-2">
              <input type="checkbox" className="accent-signal" /> Remember me
            </label>
            <a href="#" className="text-signal hover:text-ember">Forgot password?</a>
          </div>
          <button type="submit" className="flex w-full items-center justify-center gap-2 bg-signal px-4 py-2.5 text-sm font-medium text-ink hover:bg-ember transition-colors focus-ring">
            <LockIcon /> Log In to Secure Portal
          </button>
          <div className="flex items-center justify-between text-xs">
            <a href="#" className="text-signal hover:text-ember">First-time user? Activate your account</a>
            <a href="/contact" className="text-smoke hover:text-paper">Need help?</a>
          </div>
        </form>
      </div>
    </div>
  );
}

function PasswordField() {
  const [show, setShow] = useState(false);
  return (
    <label className="block">
      <span className="text-xs text-smoke">Password</span>
      <div className="relative mt-1">
        <input
          type={show ? "text" : "password"} required
          className="w-full border border-line bg-charcoal px-3 py-2 pr-16 text-sm text-paper focus-ring focus:border-signal"
        />
        <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-smoke hover:text-signal">
          {show ? "Hide" : "Show"}
        </button>
      </div>
    </label>
  );
}

function Badge({ label }: { label: string }) {
  return (
    <div className="border border-line p-3">
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

const NAV = ["Dashboard", "Documents", "Checklist", "E-Signature", "Billing & Payments", "Messages", "Tax Years", "Profile"];

function PortalDashboard({ name, onLogout }: { name: string; onLogout: () => void }) {
  const [active, setActive] = useState("Dashboard");

  return (
    <div className="mx-auto flex max-w-[1200px] gap-8 px-5 py-10">
      <aside className="hidden w-56 shrink-0 border-r border-line pr-6 lg:block">
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
        <button onClick={onLogout} className="mt-8 text-sm text-smoke hover:text-signal">← Log out</button>
      </aside>

      <div className="flex-1">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-serif text-2xl text-paper">Welcome, {name}</h1>
            <p className="text-sm text-smoke">Here's an overview of your tax account.</p>
          </div>
          <button onClick={onLogout} className="text-sm text-smoke hover:text-signal lg:hidden">Log out</button>
        </div>

        {active === "Dashboard" && (
          <>
            <div className="mt-6 grid grid-cols-3 gap-4">
              <Stat label="Tax year" value="2025 · In progress" />
              <Stat label="Pending tasks" value="3" />
              <Stat label="Documents awaiting review" value="2" />
            </div>

            <div className="mt-8 grid gap-6 lg:grid-cols-2">
              <div className="card-flat p-6">
                <h2 className="font-serif text-lg text-paper">Document upload</h2>
                <div className="mt-4 flex h-32 flex-col items-center justify-center border border-dashed border-line text-center text-sm text-smoke">
                  <p>Drag and drop your files here</p>
                  <p className="text-xs">PDF, JPG, Excel (max 25 MB)</p>
                </div>
                <p className="mt-3 text-xs text-smoke">TODO(backend): wire to Vercel Blob or Cloudinary upload + a Document model tagged by tax year.</p>

                <h3 className="mt-6 text-sm font-medium text-paper">Recent documents</h3>
                <ul className="mt-2 divide-y divide-line">
                  {DOCUMENTS.map((d) => (
                    <li key={d.name} className="flex items-center justify-between py-2 text-sm">
                      <span className="text-paper/85">{d.name}</span>
                      <span className="text-xs text-smoke">{d.tag} · {d.date}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="card-flat p-6">
                <h2 className="font-serif text-lg text-paper">Your checklist</h2>
                <ul className="mt-4 space-y-3">
                  {CHECKLIST.map((c) => (
                    <li key={c.label} className="flex items-center justify-between border-b border-line pb-3 last:border-0 text-sm">
                      <span className="text-paper/85">{c.label}</span>
                      <StatusPill status={c.status} />
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-line p-4">
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
