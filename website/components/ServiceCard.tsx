import Link from "next/link";
import type { Service } from "@/lib/data";
import { askPricing } from "@/lib/contact";
import { PRICES } from "@/lib/pricing";
import CountryBadge from "./CountryBadge";

// Per-jurisdiction visual identity: header gradient + a simple line motif.
const THEME: Record<string, { grad: string; motif: JSX.Element }> = {
  "🇵🇰": {
    grad: "from-[#0d3b2e] to-[#1b6b4f]",
    motif: <><path d="M150 20a34 34 0 1 0 0 68 28 28 0 1 1 0-68Z" /><path d="M170 30l3 8 8 1-6 6 2 8-7-4-7 4 2-8-6-6 8-1Z" /></>,
  },
  "🇺🇸": {
    grad: "from-[#14213d] to-[#2b4a8a]",
    motif: <><path d="M20 80h160M20 66h160M20 52h160M20 38h160" /><rect x="20" y="24" width="70" height="42" /></>,
  },
  "🇬🇧": {
    grad: "from-[#1d2242] to-[#8b0000]",
    motif: <><path d="M20 24l160 64M180 24L20 88M100 20v72M20 56h160" /></>,
  },
  "🇦🇪": {
    grad: "from-[#2d2d2d] to-[#b3000a]",
    motif: <><path d="M40 90V50h14v40M64 90V30h12v60M86 90V58h18v32M114 90V40h10v50M134 90V62h16v28" /></>,
  },
};

export default function ServiceCard({ service }: { service: Service }) {
  const theme = THEME[service.flag] ?? THEME["🇵🇰"];
  return (
    <div id={service.slug} className="card-flat card-lift flex h-full flex-col overflow-hidden">
      <div className={`relative h-28 bg-gradient-to-br ${theme.grad}`}>
        <svg viewBox="0 0 200 100" className="absolute inset-0 h-full w-full opacity-20" fill="none" stroke="#fff" strokeWidth="2" aria-hidden>
          {theme.motif}
        </svg>
        <div className="absolute -bottom-7 left-6"><CountryBadge flag={service.flag} size={56} /></div>
      </div>

      <div className="flex flex-1 flex-col p-6 pt-9">
        <h3 className="font-serif text-lg leading-snug text-paper">{service.title}</h3>
        {PRICES[service.slug] && <p className="mt-2 flex items-baseline gap-2"><span className="font-serif text-2xl text-signal">{PRICES[service.slug].from}</span><span className="text-xs text-smoke">{PRICES[service.slug].unit}</span></p>}

        <p className="mt-3 rounded-lg bg-cream px-3 py-2 text-xs text-smoke">
          <span className="font-medium text-signal">Who it&apos;s for · </span>{service.audience}
        </p>

        <ul className="mt-4 space-y-2.5 text-sm text-paper/85">
          {service.deliverables.map((d) => (
            <li key={d} className="flex items-start gap-2.5">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FF0404" strokeWidth="2.5" className="mt-0.5 shrink-0" aria-hidden><path d="M20 6L9 17l-5-5" /></svg>
              {d}
            </li>
          ))}
        </ul>

        <div className="mt-auto flex flex-wrap gap-3 pt-6">
          {service.ctas.map((cta, i) => {
            const cls = cta.href.startsWith("wa:")
              ? "inline-flex items-center gap-1.5 rounded-full bg-[#25D366] px-4 py-2 text-sm font-medium text-white hover:brightness-95 transition focus-ring"
              : i === 0
                ? "rounded-full border border-line px-4 py-2 text-sm text-paper/90 hover:border-signal hover:text-signal transition-colors focus-ring"
                : "rounded-full bg-signal px-4 py-2 text-sm font-medium text-white hover:bg-ember transition-colors focus-ring";
            return cta.href.startsWith("wa:") ? (
              <a key={cta.label} href={askPricing(service.title)} target="_blank" rel="noopener noreferrer" className={cls}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.2-.7.8-.8 1-.1.2-.3.2-.5.1-.2-.1-1-.4-1.9-1.2-.7-.6-1.2-1.4-1.3-1.6-.1-.2 0-.4.1-.5.1-.1.2-.3.4-.4.1-.1.2-.2.2-.4.1-.1 0-.3 0-.4-.1-.1-.6-1.4-.8-1.9-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.4.1-.6.3-.2.2-.8.8-.8 1.9s.8 2.2.9 2.3c.1.2 1.6 2.5 4 3.5.6.2 1 .4 1.3.5.6.2 1.1.2 1.5.1.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2-.1-.1-.2-.1-.5-.3Z" /></svg>
                Ask on WhatsApp
              </a>
            ) : (
              <Link key={cta.label} href={cta.href} className={cls}>{cta.label}</Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
