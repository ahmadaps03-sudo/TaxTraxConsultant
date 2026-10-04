"use client";
import { useState } from "react";
import * as T from "@/lib/tax-calc";
import { Money, Row, pkr, usd, gbp, aed, pct, toNum } from "./calculators/ui";
import { useCalculator } from "./calculators/CalculatorProvider";
import type { CalcId } from "@/lib/calc-meta";

const TABS: { k: string; label: string; id: CalcId; field: string; ph: string; note: string }[] = [
  { k: "PK", label: "Pakistan", id: "pk-salary", field: "Annual salary (PKR)", ph: "1,800,000", note: "FBR salary slabs, tax year 2026–27" },
  { k: "USA", label: "USA", id: "us-tax", field: "Annual income (USD)", ph: "85,000", note: "Federal income tax, single filer, 2026" },
  { k: "UK", label: "UK", id: "uk-tax", field: "Annual salary (GBP)", ph: "55,000", note: "Income tax + National Insurance, 2026/27" },
  { k: "UAE", label: "UAE", id: "uae-tax", field: "Annual taxable profit (AED)", ph: "1,000,000", note: "Corporate tax 9% above AED 375,000" },
];

export default function TaxEstimator() {
  const [tab, setTab] = useState(0); const [val, setVal] = useState(""); const { open } = useCalculator();
  const t = TABS[tab], n = toNum(val);
  let rows: [string, string, boolean?][] = [];
  if (n > 0) {
    if (t.k === "PK") { const r = T.salaryTax(n, "2026-27"); rows = [["Annual tax", pkr(r.total), true], ["Monthly tax", pkr(r.monthly)], ["Monthly take-home", pkr(r.netMonthly)], ["Effective rate", pct(r.effective, 1)]]; }
    if (t.k === "USA") { const r = T.usTax(n, "single"); rows = [["Federal tax", usd(r.tax), true], ["Effective rate", pct(r.effective, 1)], ["After federal tax", usd(r.net)]]; }
    if (t.k === "UK") { const r = T.ukTax(n); rows = [["Income tax", gbp(r.tax)], ["National Insurance", gbp(r.ni)], ["Monthly take-home", gbp(r.net / 12), true]]; }
    if (t.k === "UAE") { const r = T.uaeCorporateTax(n); rows = [["Corporate tax @ 9%", aed(r.tax), true], ["Profit after tax", aed(r.net)], ["Effective rate", pct(r.effective, 2)]]; }
  }
  return (
    <div className="mt-8 rounded-2xl bg-white p-5 shadow-lg shadow-black/5 sm:p-6">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Choose a country">
        {TABS.map((x, i) => (
          <button key={x.k} role="tab" aria-selected={tab === i} onClick={() => { setTab(i); setVal(""); }}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all focus-ring ${tab === i ? "bg-signal text-white shadow-md shadow-signal/30" : "border border-line text-smoke hover:border-signal hover:text-paper"}`}>{x.label}</button>))}
      </div>
      <p className="mt-4 text-xs text-smoke">{t.note}</p>
      <div className="mt-3"><Money label={t.field} value={val} onChange={setVal} placeholder={`e.g. ${t.ph}`} /></div>
      <div className="mt-5 min-h-[9.5rem] rounded-2xl bg-gradient-to-br from-graphite to-night px-5 py-3 text-white">
        {rows.length ? <div key={t.k + n} className="animate-fade">{rows.map(([l, v, s]) => <Row key={l} label={l} value={v} strong={s} />)}</div>
          : <p className="flex h-32 items-center justify-center text-center text-sm text-white/60">Enter an amount to see your estimate.</p>}
      </div>
      <button onClick={() => open(t.id)}
        className="mt-4 w-full rounded-full bg-signal px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-ember focus-ring">
        Full Calculator
      </button>
    </div>
  );
}
