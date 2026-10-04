"use client";
import { useEffect, useRef } from "react";
import { COMPONENTS } from "./Calculators";
import { CALC_META, type CalcId } from "@/lib/calc-meta";
import CountryBadge from "@/components/CountryBadge";
import Icon from "@/components/Icon";

/** Popup window for any calculator: X, Esc or a click outside closes it; focus moves in; page scroll locks. */
export default function CalculatorModal({ id, onClose }: { id: CalcId; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null); const { title, country } = CALC_META[id]; const C = COMPONENTS[id];
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; prev?.focus(); };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-night/60 p-3 animate-fade sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title}
        className="relative flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl outline-none animate-pop">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-5 py-3">
          <div className="flex min-w-0 items-center gap-3"><CountryBadge flag={country} size={32} /><h2 className="truncate font-serif text-base text-paper sm:text-lg">{title}</h2></div>
          <button onClick={onClose} aria-label="Close" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line text-smoke transition hover:border-signal hover:text-signal focus-ring"><Icon name="x" size={16} /></button>
        </div>
        <div className="overflow-y-auto px-5 pb-6 pt-4"><C /></div>
      </div>
    </div>
  );
}
