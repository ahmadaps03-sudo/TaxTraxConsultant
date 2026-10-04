"use client";
import { useState } from "react";
import { CALC_META, type CalcId } from "@/lib/calc-meta";
import { useCalculator } from "./CalculatorProvider";
import CountryBadge from "@/components/CountryBadge";
import Icon from "@/components/Icon";

const TABS = ["All", "PK", "USA", "UK", "UAE"];
export default function ToolGrid() {
  const { open } = useCalculator(); const [tab, setTab] = useState("All");
  const ids = (Object.keys(CALC_META) as CalcId[]).filter((id) => tab === "All" || CALC_META[id].country === tab);
  return (
    <div>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter calculators by country">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={`rounded-full px-4 py-1.5 text-sm transition-colors focus-ring ${tab === t ? "bg-signal text-white" : "border border-line text-smoke hover:border-signal hover:text-paper"}`}>{t === "All" ? "All tools" : t}</button>))}
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ids.map((id) => { const c = CALC_META[id]; return (
          <button key={id} onClick={() => open(id)} className="card-flat card-lift group flex flex-col p-5 text-left focus-ring">
            <div className="flex items-start justify-between">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-signal/10 text-signal transition-colors group-hover:bg-signal group-hover:text-white"><Icon name={c.icon} size={20} /></span>
              <CountryBadge flag={c.country} size={26} />
            </div>
            <p className="mt-3 font-serif text-[15px] leading-snug text-paper">{c.title}</p>
            <p className="mt-1 text-xs text-smoke">{c.sub}</p>
            <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-signal">Open <Icon name="arrow" size={14} className="transition-transform group-hover:translate-x-1" /></span>
          </button>); })}
      </div>
    </div>
  );
}
