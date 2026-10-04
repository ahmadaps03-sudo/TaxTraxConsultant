import { pageMeta } from "@/lib/seo";
import { team } from "@/lib/data";

export const metadata = pageMeta({ title: "About Us: Chartered Accountants, CPAs & Enrolled Agents", description: "Meet the TaxTrax team of FCA/ACA, CPA, EA and tax advocates covering FBR, SECP, IRS, HMRC and UAE FTA compliance.", path: "/about" });

const credentialKey: Record<string, string> = {
  FCA: "Fellow Chartered Accountant — Institute of Chartered Accountants of Pakistan (ICAP)",
  CPA: "Certified Public Accountant — US State Boards of Accountancy",
  EA: "Enrolled Agent — Licensed by the US Department of the Treasury / IRS",
  Advocate: "Tax & Corporate Attorney — High Court Bar Association / SECP / FBR Appellate Tribunal",
  CTA: "Certified Tax Advisor — International Corporate & Cross-Border Tax Specialist",
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-[1200px] px-5 py-16">
      <h1 className="font-serif text-3xl text-paper sm:text-4xl">About Us</h1>
      <p className="mt-2 font-serif text-lg text-signal">Bringing together the best in tax services</p>
      <p className="mt-4 max-w-2xl text-sm text-smoke">
        TaxTrax Consulting was built on a simple premise: tax and corporate advisory is a relationship, not a transaction.
        Clients need to know exactly who is behind the advice — so every filing carries a named, credentialed advisor,
        not a queue number.
      </p>

      <section className="mt-10">
        <h2 className="font-serif text-2xl text-paper">Leadership & advisory team</h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {team.map((m) => (
            <div key={m.name} className="card-flat p-6">
              <div className="h-14 w-14 border border-line" aria-hidden />
              <h3 className="mt-4 font-serif text-lg text-paper">{m.name}</h3>
              <p className="text-sm text-smoke">{m.title}</p>
              <p className="mt-3 ledger-rule text-sm text-signal">{m.credential}</p>
              <p className="mt-2 text-xs text-smoke">{m.jurisdiction}</p>
              <p className="mt-4 text-sm text-paper/80">{m.bio}</p>
              <div className="mt-5 flex gap-4 text-sm">
                <button className="text-signal hover:text-ember transition-colors">View LinkedIn profile</button>
                <a href="/book-consultation" className="text-signal hover:text-ember transition-colors">Book direct call</a>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10 border-t border-line pt-10">
        <h2 className="font-serif text-2xl text-paper">Credentials, explained</h2>
        <dl className="mt-6 grid gap-4 sm:grid-cols-2">
          {Object.entries(credentialKey).map(([abbr, full]) => (
            <div key={abbr} className="border border-line p-4">
              <dt className="font-serif text-signal">{abbr}</dt>
              <dd className="mt-1 text-sm text-smoke">{full}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
