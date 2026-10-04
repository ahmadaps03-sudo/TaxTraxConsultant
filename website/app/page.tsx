"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { services, stats, tools, caseStudies, team } from "@/lib/data";
import ServiceCard from "@/components/ServiceCard";
import TestimonialCarousel from "@/components/TestimonialCarousel";
import { AdvisorIllustration, PhoneMockup, WorldMap, ResourceThumb } from "@/components/Illustrations";
import { useState } from "react";
import { faqs } from "@/lib/faq";
import { OFFICE, waLink, mapsDirections, mapsEmbed } from "@/lib/contact";
import { PLANS, FEATURED_SERVICES } from "@/lib/pricing";
import Icon from "@/components/Icon";
import LazyMap from "@/components/LazyMap";
import TaxEstimator from "@/components/TaxEstimator";
import FeaturedServiceCard from "@/components/FeaturedServiceCard";
import ToolGrid from "@/components/calculators/ToolGrid";
import JsonLd from "@/components/JsonLd";

const HOW_IT_WORKS = [
  { title: "Create your account", desc: "Sign up and tell us which jurisdiction and service you need.", icon: "account" as const },
  { title: "Share your details", desc: "Answer a short questionnaire about your income or business.", icon: "profile" as const },
  { title: "Review with an advisor", desc: "A certified consultant prepares and walks you through your filing.", icon: "review" as const },
  { title: "Filed & confirmed", desc: "We submit, you get confirmation and a copy for your records.", icon: "done" as const },
];

const WHY_CHOOSE = [
  { title: "Certified & compliant", desc: "FCA, CPA, EA and CTA-credentialed advisors, not templates.", icon: "shield" as const },
  { title: "Accuracy, guaranteed", desc: "Every filing is reviewed twice before it's submitted.", icon: "check" as const },
  { title: "Secure & private", desc: "Your documents are encrypted in transit and at rest.", icon: "lock" as const },
  { title: "Support, always on", desc: "Chat, call or WhatsApp — a real person replies same-day.", icon: "support" as const },
];

const CASE_METRICS = [
  { big: "PKR 6.8M", label: "saved in year one, plus PKR 12M in refunds unlocked" },
  { big: "0%", label: "US tax friction, full legal repatriation" },
  { big: "100%", label: "FTA compliance, zero penalties" },
];

const PRICING = [
  {
    name: "Essential Filing",
    blurb: "For straightforward, routine returns.",
    features: ["48-hour to 5-day turnaround", "Prepared & filed by our tax team", "Ideal for salaried individuals", "Standard email support"],
    cta: "Get Started",
    featured: false,
  },
  {
    name: "Priority Filing",
    blurb: "For urgent or time-sensitive cases.",
    features: ["24–48 hour turnaround", "Priority handling by senior staff", "Faster response on queries", "WhatsApp support included"],
    cta: "Choose Priority",
    featured: true,
  },
  {
    name: "Premium Consultant",
    blurb: "One-on-one support from a senior consultant.",
    features: ["Zoom or in-person consultation", "Dedicated senior consultant", "Full financial review", "Best for complex, multi-country cases"],
    cta: "Book Consultation",
    featured: false,
  },
];

export default function Home() {
  const { t } = useI18n();

  return (
    <>
      {/* Hero — split layout: copy + CTAs left, custom illustration right */}
      <section className="border-b border-line bg-cream">
        <div className="mx-auto grid max-w-[1200px] items-center gap-12 px-5 py-12 sm:py-16 lg:grid-cols-2 lg:py-20">
          <div>
            <span className="animate-rise inline-block rounded-full bg-signal px-4 py-1.5 text-xs font-medium text-white">
              Now Filing in Pakistan, USA, UK &amp; UAE
            </span>

            <h1 className="animate-rise mt-6 font-serif text-4xl leading-tight text-graphite sm:text-5xl" style={{ animationDelay: "80ms" }}>
              Eliminate Tax Stress &amp; Protect Your Assets with <span className="text-signal">TaxTrax</span>
            </h1>

            <p className="animate-rise mt-5 max-w-lg text-base text-graphite/70" style={{ animationDelay: "140ms" }}>
              {t("hero.sub")}
            </p>

            <div className="animate-rise mt-8 flex flex-wrap items-center gap-4" style={{ animationDelay: "200ms" }}>
              <Link href="/book-consultation" className="rounded-full bg-signal px-6 py-2.5 text-sm font-medium text-white hover:bg-ember hover:-translate-y-0.5 hover:shadow-lg hover:shadow-signal/30 transition-all focus-ring">
                Book a Consultation
              </Link>
              <a
                href={waLink("Hi TaxTrax, I'd like to talk about my taxes.")}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-full border border-hairline bg-white px-6 py-3 text-sm font-medium text-graphite hover:border-signal hover:-translate-y-0.5 hover:shadow-md transition-all focus-ring"
              >
                <WhatsAppIcon /> Chat on WhatsApp
              </a>
            </div>

            <div className="animate-rise mt-8 flex flex-wrap items-center gap-x-8 gap-y-3" style={{ animationDelay: "240ms" }}>
              <MiniStat value="50+" label="Companies registered" />
              <MiniStat value="1,200+" label="Returns filed" />
              <MiniStat value="4.8/5" label="Client rating" />
            </div>
          </div>

          <div className="animate-rise" style={{ animationDelay: "160ms" }}>
            <HeroIllustration />
          </div>
        </div>

        {/* Trust badges — generic, jurisdiction-agnostic for an international audience */}
        <div className="mx-auto max-w-[1200px] px-5 pb-16">
          <div className="animate-rise rounded-2xl border border-hairline bg-white p-6 shadow-sm" style={{ animationDelay: "300ms" }}>
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              <TrustBadge icon={<LockBadgeIcon />} title="Secure & Encrypted" sub="Bank-grade security on every document" delay={0} />
              <TrustBadge icon={<UserBadgeIcon />} title="Expert Consultants" sub="Certified professionals at your service" delay={120} />
              <TrustBadge icon={<BoltBadgeIcon />} title="Fast Turnaround" sub="Most filings completed within days" delay={240} />
              <TrustBadge icon={<GlobeBadgeIcon />} title="Global Compliance" sub="Filings across four jurisdictions, one team" delay={360} />
            </div>
          </div>
        </div>
      </section>

      {/* Stat strip */}
      <section className="relative overflow-hidden bg-night">
        <div className="bg-dots-light absolute inset-0" aria-hidden />
        <svg className="absolute bottom-0 right-0 h-full w-1/2 text-signal/15" viewBox="0 0 300 120" preserveAspectRatio="none" aria-hidden>
          {[20, 45, 70, 55, 95, 80, 110].map((h, i) => <rect key={i} x={20 + i * 40} y={120 - h} width="24" height={h} rx="4" fill="currentColor" />)}
        </svg>
        <p className="relative mx-auto max-w-[1200px] px-5 pt-10 text-xs font-semibold uppercase tracking-[0.2em] text-white/60">TaxTrax in numbers</p>
        <div className="relative mx-auto grid max-w-[1200px] gap-8 px-5 pb-12 pt-6 sm:grid-cols-3">
          {stats.map((s) => (
            <div key={s.label} className="border-l-2 border-signal pl-5">
              <p className="font-serif text-4xl text-white">{s.value}</p>
              <p className="mt-2 max-w-xs text-sm text-mist/70">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-grid-fade border-b border-line">
        <div className="mx-auto max-w-[1200px] px-5 py-14 sm:py-20">
          <SectionHeading title="How TaxTrax Works" sub="Four steps from sign-up to a filed, confirmed return." />
          <div className="relative mt-10 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            <div className="absolute left-0 right-0 top-7 hidden border-t-2 border-dashed border-signal/30 lg:block" aria-hidden />
            {HOW_IT_WORKS.map((step, i) => (
              <div key={step.title} className="relative text-center">
                <div className="relative mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-signal text-white shadow-lg shadow-signal/30 ring-8 ring-white">
                  <StepIcon kind={step.icon} />
                  <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-graphite text-xs font-semibold">{i + 1}</span>
                </div>
                <h3 className="mt-6 font-serif text-lg text-paper">{step.title}</h3>
                <p className="mx-auto mt-2 max-w-[16rem] text-sm text-smoke">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why choose us */}
      <section className="border-b border-line bg-cream">
        <div className="mx-auto grid max-w-[1200px] items-center gap-12 px-5 py-14 sm:py-20 lg:grid-cols-5">
          <div className="relative lg:col-span-2">
            <AdvisorIllustration className="mx-auto w-full max-w-sm" />
            <div className="absolute bottom-4 right-2 rounded-2xl bg-white px-4 py-3 shadow-xl"><p className="font-serif text-2xl text-signal">4 countries</p><p className="text-xs text-smoke">one advisory team</p></div>
          </div>
          <div className="lg:col-span-3">
            <SectionHeading title="Why Choose TaxTrax" sub="What clients actually get, beyond the paperwork." />
            <div className="mt-8 grid gap-5 sm:grid-cols-2">
            {WHY_CHOOSE.map((item) => (
              <div key={item.title} className="card-flat card-lift flex gap-4 p-6">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-signal/10 text-signal"><WhyIcon kind={item.icon} /></div>
                <div>
                  <h3 className="font-serif text-base text-paper">{item.title}</h3>
                  <p className="mt-1.5 text-sm text-smoke">{item.desc}</p>
                </div>
              </div>
            ))}
            </div>
          </div>
        </div>
      </section>

      {/* Calculator + world map */}
      <section className="border-b border-line bg-cream">
        <div className="mx-auto grid max-w-[1200px] items-center gap-12 px-5 py-14 sm:py-20 lg:grid-cols-2">
          <div>
            <SectionHeading title="Calculate Your Taxes" sub="Pick a country and get an instant estimate." />
            <TaxEstimator />
          </div>
          <div className="rounded-3xl bg-white p-6 shadow-xl shadow-black/5">
            <h3 className="font-serif text-xl text-paper">One firm, four jurisdictions</h3>
            <p className="mt-1 text-sm text-smoke">Pakistan, USA, UK and UAE, handled by a single team.</p>
            <WorldMap className="mt-4 w-full" />
            <div className="mt-4 flex flex-wrap gap-2">
              {["Visa / Mastercard", "ACH", "Wire transfer", "Stripe", "Wise"].map((m) => <span key={m} className="rounded-full border border-line px-3 py-1 text-xs text-smoke">{m}</span>)}
            </div>
          </div>
        </div>
      </section>

      {/* Portal app */}
      <section className="relative overflow-hidden bg-night text-white">
        <div className="bg-dots-light absolute inset-0" aria-hidden />
        <div className="relative mx-auto grid max-w-[1200px] items-center gap-12 px-5 py-14 sm:py-20 lg:grid-cols-2">
          <div>
            <span className="mb-4 block h-1 w-12 rounded-full bg-signal" aria-hidden />
            <h2 className="font-serif text-3xl sm:text-4xl">Your client portal, anywhere</h2>
            <p className="mt-3 max-w-md text-mist/70">Upload documents, sign forms, track your filing and pay invoices from any device.</p>
            <ul className="mt-8 grid gap-5 sm:grid-cols-2">
              {[["Upload anytime", "Scan and send documents from your phone."], ["Secure & encrypted", "Bank-grade encryption with 2-factor login."], ["Live status", "Track every filing and checklist item."], ["E-sign & pay", "Sign engagement letters and pay by card or ACH."]].map(([t, d]) => (
                <li key={t} className="flex gap-3"><span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-signal"><CheckIcon /></span><span><b className="block text-sm">{t}</b><span className="text-xs text-white/60">{d}</span></span></li>
              ))}
            </ul>
            <Link href="/portal" className="mt-8 inline-block rounded-full bg-signal px-6 py-2.5 text-sm font-medium hover:bg-ember focus-ring">Open Client Portal</Link>
          </div>
          <PhoneMockup className="mx-auto h-[30rem] w-auto drop-shadow-[0_30px_50px_rgba(255,4,4,.25)]" />
        </div>
      </section>

      {/* Services grid */}
      <section id="services" className="border-b border-line">
        <div className="mx-auto max-w-[1200px] px-5 py-14 sm:py-20">
          <SectionHeading title="Our Services" sub="Clear starting prices for our most requested services in Pakistan, the USA and the UK." />
          <div className="mt-12 grid gap-7 md:grid-cols-2 lg:grid-cols-3">
            {FEATURED_SERVICES.map((slug, i) => {
              const svc = services.find((x) => x.slug === slug);
              return svc ? <FeaturedServiceCard key={slug} service={svc} index={i} /> : null;
            })}
          </div>
          <div className="mt-12 text-center">
            <Link href="/services" className="group inline-flex items-center gap-2 rounded-full border-2 border-signal px-6 py-2.5 text-sm font-semibold text-signal transition-all hover:-translate-y-0.5 hover:bg-signal hover:text-white hover:shadow-xl hover:shadow-signal/30 focus-ring">
              View all services <span className="transition-transform group-hover:translate-x-1" aria-hidden>→</span>
            </Link>
            <p className="mt-3 text-xs text-smoke">Including Sales Tax, SECP registration and UAE VAT &amp; Corporate Tax.</p>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="relative overflow-hidden border-b border-line bg-charcoal">
        <div className="bg-dots absolute inset-0 opacity-60" aria-hidden />
        <div className="relative mx-auto max-w-[1200px] px-5 py-14 sm:py-20">
          <SectionHeading title="Our Pricing Plans" sub="Transparent starting prices. Final quote depends on your case, confirmed before we begin." />
          <div className="mt-10 grid items-stretch gap-7 lg:grid-cols-3">
            {PLANS.map((plan) => (
              <div key={plan.name} className={`group relative flex flex-col rounded-3xl p-6 transition-all duration-300 hover:-translate-y-2 ${plan.featured ? "bg-graphite text-white shadow-2xl shadow-signal/25 lg:-my-4 lg:py-12" : "card-flat hover:border-signal/40 hover:shadow-2xl hover:shadow-signal/10"}`}>
                {plan.featured && <span className="absolute -top-3 left-8 rounded-full bg-signal px-3 py-1 text-xs font-semibold text-white shadow-lg shadow-signal/40">Most Popular</span>}
                <h3 className={`font-serif text-xl ${plan.featured ? "text-white" : "text-paper"}`}>{plan.name}</h3>
                <p className={`mt-1 text-sm ${plan.featured ? "text-white/60" : "text-smoke"}`}>{plan.blurb}</p>
                <p className="mt-6 font-serif text-4xl leading-none text-signal">{plan.price}</p>
                <p className={`mt-1 text-xs ${plan.featured ? "text-white/60" : "text-smoke"}`}>{plan.unit}</p>
                <ul className={`mt-6 flex-1 space-y-3 border-t pt-6 text-sm ${plan.featured ? "border-white/10 text-white/85" : "border-line text-paper/80"}`}>
                  {plan.features.map((f) => <li key={f} className="flex items-start gap-2"><CheckIcon /> {f}</li>)}
                </ul>
                <Link href={`/book-consultation?plan=${encodeURIComponent(plan.name)}`}
                  className={`mt-8 block rounded-full px-5 py-3 text-center text-sm font-semibold transition-all focus-ring ${plan.featured ? "bg-signal text-white hover:bg-ember hover:shadow-lg hover:shadow-signal/40" : "bg-signal/10 text-signal hover:bg-signal hover:text-white hover:shadow-lg hover:shadow-signal/30"}`}>
                  Book a Consultation
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tools teaser */}
      <section id="tools" className="border-b border-line">
        <div className="mx-auto max-w-[1200px] px-5 py-14 sm:py-20">
          <SectionHeading title="Free Tax Calculators" sub="Instant calculators for Pakistan, the USA, the UK and the UAE. Each one opens in a pop-up." linkHref="/tools" linkLabel="Open the tools hub" />
          <div className="mt-12"><ToolGrid /></div>
        </div>
      </section>

      {/* Case studies */}
      <section className="border-b border-line bg-charcoal">
        <div className="mx-auto max-w-[1200px] px-5 py-14 sm:py-20">
          <SectionHeading title="Our Case Studies" sub="Problem, solution, measurable result." />
          <div className="mt-12 grid gap-7 lg:grid-cols-3">
            {caseStudies.map((c, i) => (
              <div key={c.title} className="card-flat card-lift overflow-hidden">
                <div className="relative bg-graphite px-6 py-8 text-white">
                  <div className="bg-dots-light absolute inset-0" aria-hidden />
                  <p className="relative font-serif text-4xl text-signal">{CASE_METRICS[i]?.big}</p>
                  <p className="relative mt-1 text-sm text-white/70">{CASE_METRICS[i]?.label}</p>
                </div>
                <div className="p-6">
                  <h3 className="font-serif text-base text-paper">{c.title}</h3>
                  <p className="mt-1 text-xs text-smoke">{c.profile}</p>
                  <p className="mt-4 rounded-lg bg-cream p-3 text-sm text-paper/80"><span className="font-medium text-signal">Challenge · </span>{c.challenge}</p>
                  <ul className="mt-4 space-y-2 text-sm text-paper/80">
                    {c.solution.map((step) => <li key={step} className="flex gap-2"><CheckIcon /> {step}</li>)}
                  </ul>
                  <p className="mt-5 border-t border-line pt-4 text-sm font-medium text-ok">{c.result}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="border-b border-line">
        <div className="mx-auto max-w-[1200px] px-5 py-14 sm:py-20">
          <SectionHeading title="What Our Clients Say" sub="Verified reviews, filtered by service." />
          <div className="mt-10">
            <TestimonialCarousel />
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="border-b border-line bg-cream">
        <div className="mx-auto max-w-[1200px] px-5 py-14 sm:py-20">
          <SectionHeading title="Meet Our Team" sub="Credentialed across four jurisdictions." linkHref="/about" linkLabel="Meet the full team" />
          <div className="mt-10 grid gap-7 sm:grid-cols-2 lg:grid-cols-4">
            {team.map((m) => (
              <div key={m.name} className="card-flat card-lift relative p-6 pt-14 text-center">
                <div className="absolute -top-8 left-1/2 flex h-16 w-16 -translate-x-1/2 items-center justify-center rounded-full bg-gradient-to-br from-signal to-crimson font-serif text-xl text-white ring-4 ring-white">
                  {m.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                </div>
                <p className="font-serif text-base text-paper">{m.name}</p>
                <p className="mt-1 text-xs text-smoke">{m.title}</p>
                <span className="mt-4 inline-block rounded-full bg-signal/10 px-3 py-1 text-xs font-medium text-signal">{m.credential}</span>
                <p className="mt-3 text-xs text-smoke">{m.jurisdiction}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Latest resources */}
      <section className="border-b border-line">
        <div className="mx-auto max-w-[1200px] px-5 py-14 sm:py-20">
          <SectionHeading title="Latest Insights" sub="Guides and updates for filers in every jurisdiction." linkHref="/blog" linkLabel="View all" />
          <div className="mt-12 grid gap-7 md:grid-cols-3">
            {[["Tax Updates", "What changed in this year's filing rules"], ["Guide", "Forming a US LLC from Pakistan, step by step"], ["Checklist", "Documents you need before filing your return"]].map(([tag, title], i) => (
              <Link key={title} href="/blog" className="card-flat card-lift group overflow-hidden focus-ring">
                <ResourceThumb i={i} className="h-44 w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                <div className="p-6"><span className="rounded-full bg-signal/10 px-3 py-1 text-xs font-medium text-signal">{tag}</span><h3 className="mt-3 font-serif text-lg text-paper">{title}</h3><span className="mt-3 inline-block text-sm text-signal">Read more →</span></div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-b border-line bg-cream">
        <JsonLd data={{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) }} />
        <div className="mx-auto max-w-3xl px-5 py-14 sm:py-20">
          <SectionHeading title="Frequently Asked Questions" sub="Quick answers about filing, formation and compliance." />
          <div className="mt-10 space-y-3">
            {faqs.map((f) => (
              <details key={f.q} className="group card-flat px-6 py-4 open:border-signal">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-serif text-base text-paper focus-ring">
                  {f.q}
                  <span className="text-signal transition-transform group-open:rotate-45" aria-hidden>+</span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-smoke">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Location */}
      <section className="border-b border-line bg-cream">
        <div className="mx-auto max-w-[1200px] px-5 py-14 sm:py-20">
          <SectionHeading title="Visit Our Office" sub={`Find us in ${OFFICE.city}. Walk in or book an appointment. Our ${OFFICE.city} head office is open 6 days a week. Remote consultations available nationwide.`} />
          <div className="mt-12 grid gap-7 lg:grid-cols-5">
            <div className="space-y-5 lg:col-span-2">
              <div className="card-flat card-lift p-7">
                <h3 className="font-serif text-xl text-paper">Head Office, {OFFICE.city}</h3>
                <ul className="mt-5 space-y-4 text-sm text-paper/85">
                  <li className="flex gap-3"><Icon name="pin" size={18} className="mt-0.5 text-signal" /><span>{OFFICE.addressLines.map((l) => <span key={l} className="block">{l}</span>)}</span></li>
                  <li className="flex gap-3"><Icon name="phone" size={18} className="mt-0.5 text-signal" /><a href={`tel:${OFFICE.phoneTel}`} className="hover:text-signal">{OFFICE.phoneDisplay}</a></li>
                  <li className="flex gap-3"><Icon name="mail" size={18} className="mt-0.5 text-signal" /><a href={`mailto:${OFFICE.email}`} className="hover:text-signal">{OFFICE.email}</a></li>
                  <li className="flex gap-3"><Icon name="clock" size={18} className="mt-0.5 text-signal" /><span>{OFFICE.hours}</span></li>
                </ul>
                <p className="mt-5 rounded-xl bg-cream p-3 text-xs text-smoke"><b className="text-paper">Search us on Google Maps.</b> Find us by searching &ldquo;TaxTrax Consulting {OFFICE.city}&rdquo; or &ldquo;tax consultant near me {OFFICE.city}&rdquo;.</p>
                <a href={mapsDirections} target="_blank" rel="noopener noreferrer" className="mt-5 inline-block rounded-full bg-signal px-6 py-3 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-ember hover:shadow-lg hover:shadow-signal/30 focus-ring">Get Directions</a>
              </div>
              <div className="relative overflow-hidden rounded-3xl bg-graphite p-7 text-white">
                <div className="bg-dots-light absolute inset-0" aria-hidden />
                <h3 className="relative font-serif text-lg">Prefer Remote Advisory?</h3>
                <p className="relative mt-2 text-sm text-white/70">We serve clients across all of Pakistan remotely. Send documents via WhatsApp and get your filing done without leaving home.</p>
                <a href={waLink("Hi TaxTrax, I'd like remote advisory.")} target="_blank" rel="noopener noreferrer" className="relative mt-4 inline-block rounded-full bg-[#25D366] px-6 py-3 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:shadow-lg focus-ring">WhatsApp Now</a>
              </div>
            </div>
            <div className="overflow-hidden rounded-3xl border border-line bg-white shadow-xl shadow-black/5 lg:col-span-3">
              <LazyMap title={`TaxTrax Consulting office map, ${OFFICE.city}`} src={mapsEmbed} />
            </div>
          </div>
        </div>
      </section>

      {/* Closing CTA banner */}
      <section className="relative overflow-hidden bg-gradient-to-br from-signal to-crimson">
        <div className="bg-dots-light absolute inset-0" aria-hidden />
        <svg className="absolute -right-10 -top-10 h-72 w-72 text-white/10" viewBox="0 0 100 100" aria-hidden><circle cx="50" cy="50" r="48" fill="none" stroke="currentColor" strokeWidth="6" /><circle cx="50" cy="50" r="28" fill="none" stroke="currentColor" strokeWidth="6" /></svg>
        <div className="relative mx-auto flex max-w-[1200px] flex-col items-center gap-6 px-5 py-20 text-center">
          <h2 className="font-serif text-3xl text-white sm:text-4xl">Don&apos;t miss your filing deadline.</h2>
          <p className="max-w-md text-sm text-white/80">Book a consultation today and avoid late-filing penalties.</p>
          <Link href="/book-consultation" className="rounded-full bg-white px-6 py-2.5 text-sm font-medium text-signal shadow-xl hover:-translate-y-0.5 transition-transform focus-ring">
            Book Consultation
          </Link>
        </div>
      </section>
    </>
  );
}

function MiniStat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="font-serif text-xl text-graphite">{value}</p>
      <p className="text-xs text-graphite/60">{label}</p>
    </div>
  );
}

function TrustBadge({ icon, title, sub, delay }: { icon: React.ReactNode; title: string; sub: string; delay: number }) {
  return (
    <div className="group flex flex-col items-center rounded-xl p-2 text-center transition-transform hover:-translate-y-1">
      <div
        className="animate-float relative flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-signal to-ember text-white shadow-lg shadow-signal/25 transition-transform duration-300 group-hover:scale-110"
        style={{ animationDelay: `${delay}ms` }}
      >
        <span className="absolute inset-0 rounded-full bg-signal/40 opacity-0 blur-md transition-opacity duration-300 group-hover:opacity-100" aria-hidden />
        <span className="relative">{icon}</span>
      </div>
      <p className="mt-3 text-sm font-semibold text-graphite">{title}</p>
      <p className="mt-1 text-xs text-graphite/55">{sub}</p>
    </div>
  );
}

function SectionHeading({
  title, sub, linkHref, linkLabel,
}: { title: string; sub: string; linkHref?: string; linkLabel?: string }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <span className="mb-4 block h-1 w-12 rounded-full bg-signal" aria-hidden />
        <h2 className="font-serif text-3xl text-paper sm:text-4xl">{title}</h2>
        <p className="mt-3 max-w-xl text-base text-smoke">{sub}</p>
      </div>
      {linkHref && (
        <Link href={linkHref} className="rounded-full border border-line px-5 py-2 text-sm text-signal hover:border-signal transition-colors">
          {linkLabel} →
        </Link>
      )}
    </div>
  );
}

/* ---------- Icons & illustration (custom SVG, no stock imagery) ---------- */

function WhatsAppIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.2-.7.8-.8 1-.1.2-.3.2-.5.1-.2-.1-1-.4-1.9-1.2-.7-.6-1.2-1.4-1.3-1.6-.1-.2 0-.4.1-.5.1-.1.2-.3.4-.4.1-.1.2-.2.2-.4.1-.1 0-.3 0-.4-.1-.1-.6-1.4-.8-1.9-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.4.1-.6.3-.2.2-.8.8-.8 1.9s.8 2.2.9 2.3c.1.2 1.6 2.5 4 3.5.6.2 1 .4 1.3.5.6.2 1.1.2 1.5.1.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2-.1-.1-.2-.1-.5-.3Z" />
    </svg>
  );
}

function LockBadgeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <path d="M8 10V7.5a4 4 0 0 1 8 0V10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <rect x="5" y="10" width="14" height="10" rx="2.5" fill="currentColor" />
      <circle cx="12" cy="14.2" r="1.4" fill="#8B0000" />
      <rect x="11.3" y="15" width="1.4" height="2.6" rx="0.7" fill="#8B0000" />
    </svg>
  );
}

function UserBadgeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="8" r="3.6" fill="currentColor" />
      <path d="M4.5 20c1-4 4-6.2 7.5-6.2s6.5 2.2 7.5 6.2c.15.6-.3 1-.9 1H5.4c-.6 0-1.05-.4-.9-1Z" fill="currentColor" />
    </svg>
  );
}

function BoltBadgeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <path d="M13.5 2 5 14h5.5l-1 8L19 10h-5.5l1-8Z" fill="currentColor" />
    </svg>
  );
}

function GlobeBadgeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="9.5" fill="currentColor" />
      <g stroke="#8B0000" strokeWidth="1.3" fill="none">
        <ellipse cx="12" cy="12" rx="4.2" ry="9.5" />
        <path d="M2.5 12h19M4 7.5h16M4 16.5h16" />
      </g>
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="mt-0.5 shrink-0 text-ok" aria-hidden>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function StepIcon({ kind }: { kind: "account" | "profile" | "review" | "done" }) {
  const paths: Record<string, JSX.Element> = {
    account: <><circle cx="12" cy="8" r="3.2" /><path d="M5 20c1.2-3.4 4-5 7-5s5.8 1.6 7 5" /></>,
    profile: <><path d="M6 4h9l3 3v13H6z" /><path d="M9 12h6M9 16h6" /></>,
    review: <><path d="M4 12l5 5L20 6" /></>,
    done: <><circle cx="12" cy="12" r="9" /><path d="M8 12l3 3 5-6" /></>,
  };
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      {paths[kind]}
    </svg>
  );
}

function WhyIcon({ kind }: { kind: "shield" | "check" | "lock" | "support" }) {
  const paths: Record<string, JSX.Element> = {
    shield: <><path d="M12 3l7 3v6c0 4.4-3 7.7-7 9-4-1.3-7-4.6-7-9V6l7-3Z" /></>,
    check: <><circle cx="12" cy="12" r="9" /><path d="M8 12l3 3 5-6" /></>,
    lock: <><rect x="4" y="11" width="16" height="9" rx="1.5" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
    support: <><path d="M4 12a8 8 0 0 1 16 0" /><rect x="3" y="12" width="4" height="6" rx="1" /><rect x="17" y="12" width="4" height="6" rx="1" /></>,
  };
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      {paths[kind]}
    </svg>
  );
}

function HeroIllustration() {
  return (
    <svg viewBox="0 0 600 480" className="w-full max-w-lg mx-auto" role="img" aria-label="Illustration of a laptop and phone showing a tax filing dashboard, with a calculator, a tax return document and a compliance badge">
      {/* Backdrop blob */}
      <ellipse cx="300" cy="250" rx="270" ry="220" fill="#FFEBEB" />

      {/* Generic international skyline silhouette — kept to the visible left/right margins */}
      <g fill="#F2A3A7">
        <rect x="14" y="318" width="24" height="42" rx="2" />
        <path d="M66 360c0-20 13-33 28-33s28 13 28 33" />
        <rect x="90" y="303" width="7" height="30" />
        <circle cx="94" cy="299" r="4.5" />
        <rect x="478" y="278" width="34" height="82" rx="2" />
        <rect x="484" y="253" width="22" height="27" rx="2" />
        <polygon points="536,300 556,360 516,360" />
      </g>
      <rect x="40" y="358" width="520" height="4" fill="#F2A3A7" opacity="0.7" />

      {/* Laptop */}
      <g>
        <rect x="150" y="120" width="230" height="160" rx="10" fill="#FFFFFF" stroke="#ECECEC" strokeWidth="2" />
        <rect x="150" y="120" width="230" height="24" rx="10" fill="#F5F5F5" />
        <circle cx="163" cy="132" r="3" fill="#FF0404" />
        <circle cx="174" cy="132" r="3" fill="#E3E3E3" />
        <circle cx="185" cy="132" r="3" fill="#E3E3E3" />

        <rect x="166" y="158" width="90" height="9" rx="3" fill="#2D2D2D" opacity="0.85" />
        <rect x="166" y="174" width="60" height="6" rx="3" fill="#A0A0A0" />

        {/* donut chart */}
        <circle cx="216" cy="214" r="22" fill="none" stroke="#ECECEC" strokeWidth="9" />
        <circle cx="216" cy="214" r="22" fill="none" stroke="#FF0404" strokeWidth="9" strokeDasharray="83 170" strokeLinecap="round" />
        <circle cx="216" cy="214" r="22" fill="none" stroke="#2E7D32" strokeWidth="9" strokeDasharray="34 170" strokeDashoffset="-83" strokeLinecap="round" />

        <rect x="270" y="192" width="90" height="20" rx="5" fill="#F5F5F5" />
        <rect x="278" y="198" width="50" height="6" rx="3" fill="#2D2D2D" opacity="0.7" />
        <rect x="270" y="218" width="90" height="20" rx="5" fill="#F5F5F5" />
        <rect x="278" y="224" width="60" height="6" rx="3" fill="#2D2D2D" opacity="0.7" />

        <rect x="166" y="256" width="90" height="18" rx="9" fill="#FF0404" />
        <rect x="182" y="262" width="58" height="6" rx="3" fill="#FFFFFF" />

        {/* laptop base */}
        <path d="M140 280h250l14 18H126l14-18Z" fill="#2D2D2D" />
      </g>

      {/* Phone */}
      <g>
        <rect x="330" y="200" width="110" height="200" rx="16" fill="#FFFFFF" stroke="#ECECEC" strokeWidth="2" />
        <rect x="340" y="216" width="90" height="14" rx="4" fill="#F5F5F5" />
        <rect x="340" y="240" width="46" height="16" rx="8" fill="#2E7D32" opacity="0.12" />
        <circle cx="349" cy="248" r="4" fill="#2E7D32" />
        <rect x="358" y="245" width="24" height="6" rx="3" fill="#2E7D32" />

        <rect x="340" y="270" width="70" height="7" rx="3" fill="#A0A0A0" />
        <rect x="340" y="284" width="50" height="12" rx="4" fill="#2D2D2D" opacity="0.85" />

        <rect x="340" y="315" width="90" height="52" rx="8" fill="#FFF6F6" />
        <circle cx="365" cy="341" r="16" fill="none" stroke="#FF0404" strokeWidth="5" opacity="0.5" />
        <path d="M358 341l5 5 10-11" fill="none" stroke="#FF0404" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="390" y="332" width="32" height="6" rx="3" fill="#2D2D2D" opacity="0.6" />
        <rect x="390" y="344" width="24" height="8" rx="3" fill="#2D2D2D" opacity="0.85" />

        <rect x="340" y="376" width="90" height="16" rx="8" fill="#FF0404" />
      </g>

      {/* Document */}
      <g>
        <rect x="130" y="300" width="110" height="140" rx="6" fill="#FFFFFF" stroke="#E3E3E3" strokeWidth="2" />
        <rect x="146" y="316" width="78" height="7" rx="3" fill="#2D2D2D" opacity="0.75" />
        <rect x="146" y="332" width="60" height="5" rx="2" fill="#E3E3E3" />
        <rect x="146" y="344" width="70" height="5" rx="2" fill="#E3E3E3" />
        <rect x="146" y="356" width="50" height="5" rx="2" fill="#E3E3E3" />
        <rect x="146" y="372" width="70" height="5" rx="2" fill="#E3E3E3" />
        <rect x="146" y="384" width="70" height="5" rx="2" fill="#E3E3E3" />
        <rect x="146" y="396" width="40" height="5" rx="2" fill="#E3E3E3" />
        <line x1="146" y1="418" x2="224" y2="418" stroke="#E3E3E3" strokeWidth="2" />
        <rect x="146" y="424" width="50" height="6" rx="3" fill="#2D2D2D" opacity="0.5" />
      </g>

      {/* Compliance badge */}
      <g>
        <circle cx="232" cy="410" r="30" fill="#2D2D2D" />
        <path d="M220 410l8 8 16-18" fill="none" stroke="#FFFFFF" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      </g>

      {/* Calculator */}
      <g>
        <rect x="60" y="330" width="70" height="96" rx="8" fill="#2D2D2D" />
        <rect x="70" y="340" width="50" height="22" rx="4" fill="#FF0404" opacity="0.85" />
        <text x="95" y="356" textAnchor="middle" fontSize="13" fontWeight="700" fill="#FFFFFF" fontFamily="monospace">24,680</text>
        {[0, 1, 2].map((row) =>
          [0, 1, 2, 3].map((col) => (
            <circle key={`${row}-${col}`} cx={73 + col * 12.5} cy={378 + row * 15} r="4" fill="#FFFFFF" opacity="0.85" />
          ))
        )}
      </g>

      {/* Small plant accent */}
      <g>
        <rect x="480" y="400" width="30" height="24" rx="4" fill="#2D2D2D" opacity="0.85" />
        <path d="M495 400c-4-14-16-18-24-16 2 10 12 18 24 16Z" fill="#2E7D32" />
        <path d="M495 400c4-16 18-20 27-17-2 11-14 19-27 17Z" fill="#2E7D32" opacity="0.85" />
      </g>
    </svg>
  );
}