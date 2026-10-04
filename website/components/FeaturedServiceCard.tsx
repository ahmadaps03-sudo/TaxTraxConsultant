import Link from "next/link";
import type { Service } from "@/lib/data";
import { PRICES } from "@/lib/pricing";
import { askPricing } from "@/lib/contact";
import CountryBadge from "./CountryBadge";
import Icon from "./Icon";

const GRAD: Record<string, string> = { "🇵🇰": "from-[#0b3d2a] via-[#12724a] to-[#1fa86a]", "🇺🇸": "from-[#101c3d] via-[#233f86] to-[#3b63c9]", "🇬🇧": "from-[#2a1030] via-[#7a1233] to-[#c4123f]", "🇦🇪": "from-[#1f1f1f] via-[#5a0a10] to-[#e3000f]" };

export default function FeaturedServiceCard({ service, index }: { service: Service; index: number }) {
  const price = PRICES[service.slug];
  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-line bg-white transition-all duration-300 hover:-translate-y-1 hover:border-signal/40 hover:shadow-2xl hover:shadow-signal/15" style={{ transitionDelay: "0ms" }} data-index={index}>
      <div className={`relative overflow-hidden bg-gradient-to-br ${GRAD[service.flag] ?? GRAD["🇵🇰"]} px-6 pb-10 pt-6 text-white`}>
        <div className="bg-dots-light absolute inset-0 opacity-70" aria-hidden />
        <span className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 transition-transform duration-700 group-hover:scale-150" aria-hidden />
        <span className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 -skew-x-12 bg-white/15 opacity-0 transition-all duration-700 group-hover:left-full group-hover:opacity-100" aria-hidden />
        <div className="relative flex items-center justify-between"><CountryBadge flag={service.flag} size={52} /><span className="rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider backdrop-blur">Most requested</span></div>
        <h3 className="relative mt-4 min-h-[3.4rem] font-serif text-xl leading-snug">{service.title}</h3>
      </div>

      <div className="relative -mt-6 flex flex-1 flex-col rounded-t-3xl bg-white px-6 pb-6 pt-5">
        {price && (
          <div className="mb-4 flex items-end justify-between border-b border-line pb-4">
            <div><p className="text-[11px] font-semibold uppercase tracking-wider text-smoke">Starting from</p>
              <p className="font-serif text-4xl leading-none text-signal">{price.from}</p></div>
            <p className="max-w-[9rem] text-right text-xs text-smoke">{price.unit}</p>
          </div>)}
        <p className="rounded-xl bg-cream px-3 py-2 text-xs text-smoke"><span className="font-semibold text-signal">Who it&apos;s for · </span>{service.audience}</p>
        <ul className="mt-4 space-y-2.5 text-sm text-paper/85">
          {service.deliverables.map((d) => (
            <li key={d} className="flex items-start gap-2.5">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-signal/10 text-signal transition-colors group-hover:bg-signal group-hover:text-white">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden><path d="M20 6L9 17l-5-5" /></svg></span>{d}
            </li>))}
        </ul>
        {price && <p className="mt-4 text-xs text-smoke">{price.note}</p>}
        <div className="mt-auto flex items-center gap-3 pt-6">
          <Link href={`/book-consultation?service=${service.slug}`} className="flex-1 whitespace-nowrap rounded-full bg-signal px-4 py-2.5 text-center text-sm font-semibold text-white transition-colors hover:bg-ember focus-ring">Book a Consultation</Link>
          <a href={askPricing(service.title)} target="_blank" rel="noopener noreferrer" aria-label="Ask about pricing on WhatsApp" title="Ask on WhatsApp"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line text-[#128C7E] transition-colors hover:border-[#25D366] hover:bg-[#25D366] hover:text-white focus-ring"><Icon name="phone" size={17} /></a>
        </div>
      </div>
    </article>
  );
}
