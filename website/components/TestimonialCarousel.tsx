"use client";

import { useMemo, useState } from "react";
import { testimonials } from "@/lib/data";

const filters = ["All", "FBR Filer", "Sales Tax", "SECP", "US LLC", "UK Ltd", "UAE Tax"];

function matches(service: string, filter: string) {
  if (filter === "All") return true;
  const map: Record<string, string[]> = {
    "FBR Filer": ["Income Tax Return"],
    "Sales Tax": ["Sales Tax", "IT Exporter"],
    SECP: ["Company Registration", "SECP"],
    "US LLC": ["USA LLC"],
    "UK Ltd": ["UK Ltd"],
    "UAE Tax": ["UAE"],
  };
  return (map[filter] || []).some((s) => service.includes(s));
}

export default function TestimonialCarousel() {
  const [filter, setFilter] = useState("All");
  const [index, setIndex] = useState(0);

  const filtered = useMemo(() => testimonials.filter((t) => matches(t.service, filter)), [filter]);
  const current = filtered[index % Math.max(filtered.length, 1)];

  return (
    <div>
      <div className="flex flex-wrap gap-2 border-b border-line pb-4">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => { setFilter(f); setIndex(0); }}
            className={`rounded-full px-4 py-1.5 text-sm transition-colors focus-ring ${
              filter === f ? "bg-signal text-white" : "border border-line text-smoke hover:text-paper hover:border-signal"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {current ? (
        <div className="relative mt-6 overflow-hidden rounded-3xl bg-night p-6 text-white sm:p-12">
          <svg className="absolute -top-4 right-6 h-40 w-40 text-signal/20" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M9 7H5a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h2a3 3 0 0 1-3 3v2a5 5 0 0 0 5-5V9a2 2 0 0 0-2-2Zm10 0h-4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h2a3 3 0 0 1-3 3v2a5 5 0 0 0 5-5V9a2 2 0 0 0-2-2Z" /></svg>
          <div className="relative flex items-center gap-2 text-xs text-emerald-300"><CheckIcon /> Verified review</div>
          <p className="relative mt-5 max-w-3xl font-serif text-xl leading-relaxed text-white/95 sm:text-2xl">&ldquo;{current.quote}&rdquo;</p>
          <div className="relative mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-6">
            <div className="flex items-center gap-4">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-signal font-serif text-lg">{current.name[0]}</span>
              <div>
                <p className="text-sm font-medium">{current.name}</p>
                <p className="text-xs text-white/60">{current.role} · {current.location}</p>
              </div>
            </div>
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/80">{current.service}</span>
          </div>
          {filtered.length > 1 && (
            <div className="relative mt-6 flex gap-2">
              <button onClick={() => setIndex((i) => (i - 1 + filtered.length) % filtered.length)} aria-label="Previous review" className="rounded-full border border-white/20 px-4 py-1.5 text-sm hover:border-signal focus-ring">←</button>
              <button onClick={() => setIndex((i) => (i + 1) % filtered.length)} aria-label="Next review" className="rounded-full border border-white/20 px-4 py-1.5 text-sm hover:border-signal focus-ring">→</button>
            </div>
          )}
        </div>
      ) : (
        <p className="mt-6 text-sm text-smoke">No reviews yet for this service.</p>
      )}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}
