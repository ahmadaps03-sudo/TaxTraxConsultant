"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { waLink } from "@/lib/contact";

const HIDE = ["/", "/contact", "/book-consultation", "/portal", "/login", "/signup"];
export default function CtaBand() {
  const path = usePathname();
  if (HIDE.includes(path) || path.startsWith("/portal")) return null;
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-graphite to-night text-white">
      <div className="bg-dots-light absolute inset-0" aria-hidden />
      <span className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full border-[18px] border-signal/20" aria-hidden />
      <div className="relative mx-auto flex max-w-[1200px] flex-col items-center justify-between gap-6 px-5 py-10 text-center md:flex-row md:text-left">
        <div><h2 className="font-serif text-xl sm:text-2xl">Ready to simplify your taxes?</h2><p className="mt-2 text-sm text-white/70">Talk to a certified TaxTrax advisor about your situation.</p></div>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/book-consultation" className="rounded-full bg-signal px-6 py-2.5 text-sm font-semibold transition-all hover:-translate-y-0.5 hover:bg-ember hover:shadow-lg hover:shadow-signal/40 focus-ring">Book a Consultation</Link>
          <a href={waLink("Hi TaxTrax, I have a question.")} target="_blank" rel="noopener noreferrer" className="rounded-full border border-white/30 px-6 py-2.5 text-sm transition-all hover:-translate-y-0.5 hover:border-white focus-ring">Chat on WhatsApp</a>
        </div>
      </div>
    </section>
  );
}
