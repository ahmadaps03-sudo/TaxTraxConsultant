"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { useCalculator } from "./calculators/CalculatorProvider";
import type { CalcId } from "@/lib/calc-meta";

export default function Footer() {
  const { t } = useI18n();
  return (
    <footer className="bg-night text-mist">
      <div className="mx-auto max-w-[1200px] px-5 py-14 grid gap-10 md:grid-cols-4">
        <div>
          <div className="flex items-center gap-2 font-serif text-lg font-semibold text-white">
            <img src="/logo/taxtrax-mark.png" alt="TaxTrax Consulting" className="h-8 w-8 object-contain" />
            <span className="font-bold">TaxTraxConsulting</span>
          </div>
          <p className="mt-3 max-w-xs text-sm text-mist/60">
            Cross-border tax and corporate advisory — Pakistan, USA, UK and UAE filings under one roof.
          </p>
          <div className="mt-4 flex items-center gap-3 text-xs text-mist/50">
            <TrustChip>Bank-grade security</TrustChip>
            <TrustChip>Certified advisors</TrustChip>
          </div>
        </div>

        <FooterCol title="Services" links={[
          ["Income Tax Return (FBR)", "/services#income-tax-return-fbr"],
          ["Sales Tax Registration", "/services#sales-tax-registration"],
          ["Company Registration (SECP)", "/services#company-registration-secp"],
          ["USA LLC & Tax Filing", "/services#usa-llc-tax-filing"],
        ]} />

        <FooterCol title="Tools" links={[
          ["Salary Tax Calculator", "calc:pk-salary"],
          ["Sales Tax / GST Calculator", "calc:pk-gst"],
          ["WHT Calculator", "calc:pk-wht"],
          ["Filer Status Checker", "calc:pk-ntn"],
        ]} />

        <FooterCol title="Company" links={[
          ["About Us", "/about"],
          ["Insights", "/blog"],
          ["Resources", "/resources"],
          ["Contact", "/contact"],
          ["Client Portal", "/portal"],
        ]} />
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto max-w-[1200px] px-5 py-6 flex flex-col gap-3 text-xs text-mist/50 md:flex-row md:items-center md:justify-between">
          <p>&copy; {new Date().getFullYear()} TaxTrax Consulting. {t("footer.rights")}</p>
          <p className="max-w-xl">{t("footer.disclaimer")}</p>
        </div>
      </div>
    </footer>
  );
}

function TrustChip({ children }: { children: React.ReactNode }) {
  return <span className="border border-white/15 px-2 py-1">{children}</span>;
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  const { open } = useCalculator();
  return (
    <div>
      <h3 className="text-sm font-medium text-white">{title}</h3>
      <ul className="mt-3 space-y-2">
        {links.map(([label, href]) => (
          <li key={href}>
            {href.startsWith("calc:") ? (
              <button onClick={() => open(href.slice(5) as CalcId)} className="text-left text-sm text-mist/60 hover:text-signal transition-colors">{label}</button>
            ) : (
              <Link href={href} className="text-sm text-mist/60 hover:text-signal transition-colors">{label}</Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
