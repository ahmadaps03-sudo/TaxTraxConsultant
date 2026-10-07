"use client";

import Link from "next/link";
import CountryBadge from "./CountryBadge";
import { useState } from "react";
import { services, tools } from "@/lib/data";
import LanguageToggle from "./LanguageToggle";
import Icon from "./Icon";
import { useCalculator } from "./calculators/CalculatorProvider";
import { SLUG_TO_ID, type CalcId } from "@/lib/calc-meta";

type Item = { label: string; href: string; calc?: CalcId };
const dropdowns: { label: string; items: Item[]; viewAllHref: string }[] = [
  {
    label: "Tax Tools",
    items: tools.map((t) => ({ label: t.title, href: `/tools/${t.slug}`, calc: SLUG_TO_ID[t.slug] as CalcId | undefined })),
    viewAllHref: "/tools",
  },
  {
    label: "Services",
    items: services.map((s) => ({ label: s.title, href: `/services#${s.slug}` })),
    viewAllHref: "/services",
  },
  {
    label: "Resources",
    items: [
      { label: "Insights / Blog", href: "/blog" },
      { label: "Videos", href: "/resources" },
    ],
    viewAllHref: "/resources",
  },
];

const intlServices = {
  label: "USA, UK & UAE Services",
  flag: "globe",
  items: [
    { label: "USA LLC & Tax Filing", href: "/services#usa-llc-tax-filing", flag: "🇺🇸" },
    { label: "UK Ltd Registration & Tax Filing", href: "/services#uk-ltd-registration", flag: "🇬🇧" },
    { label: "UAE VAT & Corporate Tax", href: "/services#uae-vat-corporate-tax", flag: "🇦🇪" },
  ],
  viewAllHref: "/services",
};

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const { open: openCalc } = useCalculator();

  return (
    <header className="sticky top-0 z-50 border-b border-hairline bg-cream/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-[clamp(0.5rem,1vw,1rem)] px-[clamp(1rem,1.6vw,1.75rem)] py-2.5">
        <Link href="/" className="flex items-center gap-2 shrink-0 whitespace-nowrap font-serif text-[clamp(1rem,1.25vw,1.125rem)] font-semibold text-graphite">
          <img src="/logo/taxtrax-mark.png" alt="TaxTrax Consulting" className="h-9 w-9 object-contain" />
          TaxTraxConsulting
        </Link>

        <nav className="hidden min-w-0 flex-nowrap items-center gap-0.5 min-[1180px]:flex">
          <Link href="/" className="px-[clamp(0.4rem,0.65vw,0.625rem)] py-2 whitespace-nowrap text-[clamp(0.84rem,1vw,0.92rem)] text-graphite/85 hover:text-crimson transition-colors focus-ring">
            Home
          </Link>
          {dropdowns.map((d) => (
            <div key={d.label} className="group relative">
              <button className="flex items-center gap-1 whitespace-nowrap px-[clamp(0.4rem,0.65vw,0.625rem)] py-2 whitespace-nowrap text-[clamp(0.84rem,1vw,0.92rem)] text-graphite/85 hover:text-crimson transition-colors focus-ring">
                {d.label} <Chevron />
              </button>
              <div className="invisible absolute left-0 top-full w-64 border border-hairline bg-cream opacity-0 shadow-lg transition-all group-hover:visible group-hover:opacity-100">
                <ul className="py-2">
                  {d.items.map((item) => (
                    <li key={item.href}>
                      {item.calc ? (
                        <button onClick={() => openCalc(item.calc!)} className="w-full text-left block px-4 py-2 text-sm text-graphite/80 hover:bg-hairline/40 hover:text-crimson">{item.label}</button>
                      ) : (
                        <Link href={item.href} className="block px-4 py-2 text-sm text-graphite/80 hover:bg-hairline/40 hover:text-crimson">{item.label}</Link>
                      )}
                    </li>
                  ))}
                </ul>
                <Link href={d.viewAllHref} className="block border-t border-hairline px-4 py-2 text-xs text-crimson hover:text-ember">
                  View all →
                </Link>
              </div>
            </div>
          ))}
          <div className="group relative">
            <button className="flex items-center gap-1.5 whitespace-nowrap px-[clamp(0.4rem,0.65vw,0.625rem)] py-2 whitespace-nowrap text-[clamp(0.84rem,1vw,0.92rem)] text-graphite/85 hover:text-crimson transition-colors focus-ring">
              <Icon name="globe" size={15} /> <span className="min-[1440px]:hidden">Global</span><span className="hidden min-[1440px]:inline">Global Services</span> <Chevron />
            </button>
            <div className="invisible absolute right-0 top-full w-64 border border-hairline bg-cream opacity-0 shadow-lg transition-all group-hover:visible group-hover:opacity-100">
              <ul className="py-2">
                {intlServices.items.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} className="flex items-center gap-2.5 px-4 py-2 text-sm text-graphite/80 hover:bg-hairline/40 hover:text-crimson">
                      <CountryBadge flag={item.flag} size={22} />
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
              <Link href={intlServices.viewAllHref} className="block border-t border-hairline px-4 py-2 text-xs text-crimson hover:text-ember">
                View all →
              </Link>
            </div>
          </div>
          <Link href="/contact" className="px-[clamp(0.4rem,0.65vw,0.625rem)] py-2 whitespace-nowrap text-[clamp(0.84rem,1vw,0.92rem)] text-graphite/85 hover:text-crimson transition-colors focus-ring">Contact Us</Link>
        </nav>

        <div className="hidden shrink-0 items-center gap-2 min-[1180px]:flex">
          <LanguageToggle />
          <Link
            href="/portal"
            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-hairline px-[clamp(0.7rem,1vw,0.875rem)] py-1.5 text-[clamp(0.84rem,1vw,0.92rem)] text-graphite hover:border-crimson hover:text-crimson transition-colors focus-ring"
          >
            <Icon name="lock" size={14} /> <span className="min-[1440px]:hidden">Portal</span><span className="hidden min-[1440px]:inline">Client Portal</span>
          </Link>
          <Link
            href="/book-consultation"
            className="shrink-0 whitespace-nowrap rounded-full bg-signal px-[clamp(0.8rem,1.1vw,1rem)] py-2 text-[clamp(0.84rem,1vw,0.92rem)] font-medium text-white hover:bg-ember transition-colors focus-ring"
          >
            <span className="min-[1440px]:hidden">Book Now</span><span className="hidden min-[1440px]:inline">Book a Consultation</span>
          </Link>
        </div>

        <button
          className="p-2 text-graphite min-[1180px]:hidden focus-ring"
          aria-label="Toggle menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <MenuIcon open={open} />
        </button>
      </div>

      {open && (
        <div className="border-t border-hairline bg-cream px-5 py-4 min-[1180px]:hidden">
          <nav className="flex flex-col gap-4">
            <Link href="/" onClick={() => setOpen(false)} className="text-sm text-graphite/85">
              Home
            </Link>
            {dropdowns.map((d) => (
              <div key={d.label}>
                <p className="text-xs uppercase-none text-smoke">{d.label}</p>
                <div className="mt-2 flex flex-col gap-2">
                  {d.items.map((item) => (
                    item.calc ? (
                      <button key={item.href} onClick={() => { setOpen(false); openCalc(item.calc!); }} className="text-left text-sm text-graphite/85">{item.label}</button>
                    ) : (
                      <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className="text-sm text-graphite/85">{item.label}</Link>
                    )
                  ))}
                </div>
              </div>
            ))}
            <div>
              <p className="text-xs uppercase-none text-smoke">
                <Icon name="globe" size={15} /> {intlServices.label}
              </p>
              <div className="mt-2 flex flex-col gap-2">
                {intlServices.items.map((item) => (
                  <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className="flex items-center gap-2.5 text-sm text-graphite/85">
                    <CountryBadge flag={item.flag} size={22} />
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
            <Link href="/contact" onClick={() => setOpen(false)} className="text-sm text-graphite/85">Contact Us</Link>
            <div className="flex items-center justify-between border-t border-hairline pt-3">
              <LanguageToggle />
            </div>
            <Link href="/portal" onClick={() => setOpen(false)} className="rounded-full border border-hairline px-4 py-2 text-center text-sm text-graphite">
              Visit Client Portal
            </Link>
            <Link
              href="/book-consultation"
              onClick={() => setOpen(false)}
              className="rounded-full bg-signal px-4 py-2 text-center text-sm font-medium text-white"
            >
              Book a Consultation
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}

function Chevron() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
    </svg>
  );
}