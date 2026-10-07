"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "./Icon";
import { useCalculator } from "./calculators/CalculatorProvider";

/** App-style bottom tab bar. Phones only (hidden from md up). */
export default function MobileBottomBar() {
  const path = usePathname() || "/";
  const { open } = useCalculator();
  if (path.startsWith("/portal") || path.startsWith("/book-consultation")) return null;

  const Tab = ({ href, label, icon, match }: { href: string; label: string; icon: "briefcase" | "calculator" | "mail"; match: boolean }) => (
    <Link href={href} className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[0.68rem] font-medium ${match ? "text-signal" : "text-smoke"}`}>
      <Icon name={icon} size={20} />
      {label}
    </Link>
  );

  return (
    <nav
      aria-label="Quick navigation"
      className="fixed inset-x-0 bottom-0 z-[60] border-t border-hairline bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <div className="relative mx-auto flex max-w-md items-end px-2">
        <Link href="/" className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[0.68rem] font-medium ${path === "/" ? "text-signal" : "text-smoke"}`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></svg>
          Home
        </Link>
        <Tab href="/services" label="Services" icon="briefcase" match={path.startsWith("/services")} />
        {/* Centre call-to-action */}
        <Link
          href="/book-consultation"
          className="-mt-5 mb-1 flex h-14 w-[4.5rem] shrink-0 flex-col items-center justify-center rounded-2xl bg-signal text-[0.65rem] font-semibold text-white shadow-lg shadow-signal/40 active:scale-95"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
          Book
        </Link>
        <button onClick={() => open("pk-salary")} className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[0.68rem] font-medium text-smoke">
          <Icon name="calculator" size={20} />
          Tools
        </button>
        <Tab href="/contact" label="Contact" icon="mail" match={path.startsWith("/contact")} />
      </div>
    </nav>
  );
}