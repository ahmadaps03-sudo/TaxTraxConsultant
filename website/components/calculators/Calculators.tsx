"use client";
import { useState } from "react";
import { waLink, OFFICE } from "@/lib/contact";
import * as T from "@/lib/tax-calc";
import { Money, Pick, Row, Results, Empty, RefTable, Actions, Disclaimer, inr, pkr, usd, gbp, aed, pct, toNum } from "./ui";

const FILER = [{ value: "filer", label: "Active Filer" }, { value: "non", label: "Non-Filer" }];
const slabRows = (slabs: T.Slab[]) => slabs.map((s, i) => [
  i === 0 ? `Up to ${inr(s.to)}` : s.to === Infinity ? `Above ${inr(s.from)}` : `${inr(s.from + 1)} – ${inr(s.to)}`,
  pct(s.rate, 0), i === 0 ? "Nil" : `${s.fixed ? inr(s.fixed) : "Nil"} + ${pct(s.rate, 0)} of excess`]);

/* ---------- Pakistan: salary ---------- */
export function PkSalary() {
  const [gross, setGross] = useState(""); const [filer, setFiler] = useState("filer"); const [year, setYear] = useState<T.PkYear>("2026-27");
  const y = T.PK_SALARY_YEARS[year], a = toNum(gross), r = a > 0 ? T.salaryTax(a, year) : null;
  const lines = r ? [`Annual gross: ${pkr(a)}`, `Slab rate: ${pct(r.slab.rate, 0)}`, `Annual tax: ${pkr(r.total)}`, `Monthly tax: ${pkr(r.monthly)}`, `Annual net: ${pkr(r.net)}`] : [];
  return (
    <div>
      <p className="text-sm text-smoke">FBR {y.act} · Salaried Persons</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><Money label="Annual Gross Salary (PKR)" value={gross} onChange={setGross} placeholder="e.g. 1,800,000" hint="Enter your total annual salary before any deductions" /></div>
        <Pick label="Filer Status" value={filer} onChange={setFiler} options={FILER} />
        <Pick label="Tax Year" value={year} onChange={(v) => setYear(v as T.PkYear)} options={[{ value: "2026-27", label: "2026–27 (current)" }, { value: "2025-26", label: "2025–26" }]} />
      </div>
      {r ? (
        <Results>
          <Row label="Annual gross salary" value={pkr(a)} /><Row label="Monthly gross salary" value={pkr(a / 12)} />
          <Row label="Applicable slab rate" value={pct(r.slab.rate, 0)} /><Row label="Income tax (before surcharge)" value={pkr(r.tax)} />
          {r.surcharge > 0 && <Row label="Surcharge (9% above PKR 10M)" value={pkr(r.surcharge)} />}
          <Row label="Total annual tax" value={pkr(r.total)} strong /><Row label="Monthly tax deduction" value={pkr(r.monthly)} />
          <Row label="Annual net take-home" value={pkr(r.net)} strong /><Row label="Monthly net take-home" value={pkr(r.netMonthly)} /><Row label="Effective tax rate" value={pct(r.effective, 2)} />
        </Results>) : <Empty text="Enter your annual salary to see your tax, monthly deduction and take-home pay." />}
      {filer === "non" && <p className="mt-3 rounded-xl bg-signal/10 p-3 text-xs text-paper">Salary slabs are the same for non-filers, but non-filers pay roughly double withholding on banking, vehicles, property and more. Getting on the Active Taxpayer List saves money.</p>}
      <RefTable title={`FBR Salary Tax Slabs ${y.label}`} head={["Annual Income (PKR)", "Rate", "Fixed Tax"]} rows={slabRows(y.slabs as T.Slab[])} active={r?.index} />
      {r && <Actions title={`Salary Tax ${y.label}`} lines={lines} trigger="Overpaying tax? File your annual return with TaxTrax to claim eligible deductions and credits." />}
      <Disclaimer>{year === "2026-27" ? "2026–27 slabs follow published reports of the Finance Act 2026. " : ""}Excludes deductions, credits and allowances. Indicative only.</Disclaimer>
    </div>
  );
}

/* ---------- Pakistan: GST ---------- */
export function PkGst() {
  const [mode, setMode] = useState<"add" | "remove">("add"); const [amount, setAmount] = useState(""); const [ri, setRi] = useState("0");
  const rate = T.GST_RATES[+ri].rate, a = toNum(amount), r = a > 0 ? T.gst(a, rate, mode) : null;
  const lines = r ? [`Mode: ${mode === "add" ? "Add GST" : "Remove GST"}`, `Rate: ${pct(rate, 0)}`, `Base: ${pkr(r.base)}`, `GST: ${pkr(r.gst)}`, `Total: ${pkr(r.total)}`] : [];
  return (
    <div>
      <p className="text-sm text-smoke">Pakistan Sales Tax Act · Standard & Reduced Rates</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><Pick label="Calculation Mode" value={mode} onChange={(v) => setMode(v as "add" | "remove")} options={[{ value: "add", label: "Add GST to Amount (Exclusive)" }, { value: "remove", label: "Remove GST from Amount (Inclusive)" }]} /></div>
        <Money label="Amount (PKR)" value={amount} onChange={setAmount} placeholder="e.g. 100,000" />
        <Pick label="GST / Sales Tax Rate" value={ri} onChange={setRi} options={T.GST_RATES.map((g, i) => ({ value: String(i), label: g.label }))} />
      </div>
      {r ? <Results><Row label="Base price (excl. GST)" value={pkr(r.base)} /><Row label={`GST @ ${pct(rate, 0)}`} value={pkr(r.gst)} /><Row label="Final amount (incl. GST)" value={pkr(r.total)} strong /></Results> : <Empty text="Enter an amount to calculate GST." />}
      <RefTable title="Quick Rate Reference" head={["Category", "Rate", "Authority"]} rows={[["General Goods", "18%", "FBR"], ["Petroleum Products", "13%", "FBR"], ["Services (Punjab)", "17%", "PRA"], ["Services (Sindh)", "16%", "SRB"], ["Services (KP / Bal)", "15%", "KPRA / BRA"], ["Edible Oils", "8%", "FBR"], ["Zero-rated Exports", "0%", "FBR"]]} />
      {r && <Actions title="GST Calculation" lines={lines} trigger="Need monthly STRN sales tax return filing and annexure reconciliation? Book a consultation." />}
      <Disclaimer />
    </div>
  );
}

/* ---------- Pakistan: business ---------- */
export function PkBusiness() {
  const [type, setType] = useState<T.BizType>("company"); const [rev, setRev] = useState(""); const [exp, setExp] = useState(""); const [filer, setFiler] = useState("filer"); const [year, setYear] = useState("2026-27");
  const R = toNum(rev), E = toNum(exp), r = R > 0 ? T.businessTax(type, R, E) : null;
  const lines = r ? [`Revenue: ${pkr(R)}`, `Expenses: ${pkr(E)}`, `Taxable income: ${pkr(r.taxable)}`, `Tax: ${pkr(r.tax)} (${r.label})`, `Net after tax: ${pkr(r.net)}`] : [];
  return (
    <div>
      <p className="text-sm text-smoke">Corporate & AOP Tax · FBR Finance Act</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><Pick label="Business Type" value={type} onChange={(v) => setType(v as T.BizType)} options={[{ value: "company", label: "Company" }, { value: "aop", label: "AOP / Partnership" }, { value: "sme", label: "SME / Startup" }]} /></div>
        <Money label="Gross Revenue / Turnover (PKR)" value={rev} onChange={setRev} placeholder="e.g. 10,000,000" />
        <Money label="Allowable Expenses (PKR)" value={exp} onChange={setExp} placeholder="e.g. 7,000,000" />
        <Pick label="Filer Status" value={filer} onChange={setFiler} options={FILER} />
        <Pick label="Tax Year" value={year} onChange={setYear} options={[{ value: "2026-27", label: "2026–27" }, { value: "2025-26", label: "2025–26" }]} />
      </div>
      {r ? (
        <Results>
          <Row label="Gross revenue" value={pkr(R)} /><Row label="Allowable expenses" value={pkr(E)} /><Row label="Taxable net income" value={pkr(r.taxable)} />
          <Row label="Applicable rate" value={`${r.label}`} /><Row label="Estimated tax payable" value={pkr(r.tax)} strong />
          <Row label="Net profit after tax" value={pkr(r.net)} strong /><Row label="Effective rate" value={pct(r.effective, 1)} />
        </Results>) : <Empty text="Enter revenue and expenses to estimate your business tax." />}
      {r && type === "aop" && <p className="mt-3 rounded-xl bg-signal/10 p-3 text-xs text-paper">As a private company the same profit would attract about {pkr(r.asCompany)} corporate tax ({r.saving > 0 ? `a saving of ${pkr(r.saving)}` : "no saving at this profit level"}), before dividend and compliance costs. Ask us whether incorporating makes sense.</p>}
      {filer === "non" && <p className="mt-3 text-xs text-smoke">Income tax rates do not change by filer status, but non-filers face double withholding on many transactions.</p>}
      <RefTable title="Corporate Tax Rates" head={["Entity Type", "Rate", "Notes"]} rows={[["Public Companies (listed)", "29%", "Standard rate"], ["Private Companies", "29%", "On taxable income"], ["Small Companies (SME)", "20%", "Revenue < 250M"], ["AOP / Partnership", "Slab-based", "Similar to individual"], ["Banking Companies", "39%", "Includes surcharge"]]} />
      {r && <Actions title="Business Tax Estimate" lines={lines} trigger="Compare whether converting your business into an SECP Private Limited Company lowers your total tax." />}
      <Disclaimer>Super tax, minimum tax and turnover tax are not included.</Disclaimer>
    </div>
  );
}

/* ---------- Pakistan: withholding ---------- */
export function PkWht() {
  const [ti, setTi] = useState("0"); const [filer, setFiler] = useState("filer"); const [amt, setAmt] = useState("");
  const t = T.WHT_RATES[+ti], rate = filer === "filer" ? t.filer : t.filer * 2, a = toNum(amt);
  return (
    <div>
      <p className="text-sm text-smoke">Withholding tax on payments to vendors · filer vs non-filer</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Pick label="Transaction Type" value={ti} onChange={setTi} options={T.WHT_RATES.map((w, i) => ({ value: String(i), label: w.label }))} />
        <Pick label="Vendor Filer Status" value={filer} onChange={setFiler} options={[{ value: "filer", label: "Filer" }, { value: "non", label: "Non-Filer (double rate)" }]} />
        <div className="sm:col-span-2"><Money label="Gross Invoice Value (PKR)" value={amt} onChange={setAmt} placeholder="e.g. 500,000" /></div>
      </div>
      {a > 0 ? <Results><Row label="Applicable WHT rate" value={pct(rate, 1)} /><Row label="Tax withheld" value={pkr(a * rate)} strong /><Row label="Net payable to vendor" value={pkr(a - a * rate)} strong /></Results> : <Empty text="Enter the invoice value to see the withholding amount." />}
      {a > 0 && <Actions title="Withholding Tax Calculation" lines={[`${t.label}`, `Rate: ${pct(rate, 1)}`, `Withheld: ${pkr(a * rate)}`, `Net payable: ${pkr(a - a * rate)}`]} trigger="Need automated monthly withholding tax (Section 165) filing for your business? Partner with TaxTrax." />}
      <Disclaimer>Rates are simplified; actual WHT depends on the section, vendor category and amount.</Disclaimer>
    </div>
  );
}

/* ---------- Pakistan: NTN checker ---------- */
export function NtnChecker() {
  const steps = ["Visit the FBR IRIS portal using the button below", "Click “Online NTN/STRN Inquiry” or use “ATL Filer Verification”", "Enter your CNIC number (13 digits without dashes)", "Your NTN number and active filer status will display", "For assistance, contact TaxTrax directly via WhatsApp"];
  return (
    <div>
      <p className="text-sm text-smoke">FBR IRIS Portal · Verify NTN & Active Filer</p>
      <p className="mt-3 text-sm text-paper/80">Verify your NTN (National Tax Number) and Active Filer status directly on the FBR IRIS portal using your CNIC or NTN number.</p>
      <ol className="mt-5 space-y-3">{steps.map((s, i) => (
        <li key={s} className="flex items-start gap-3 text-sm text-paper/85"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-signal text-xs font-bold text-white">{i + 1}</span><span className="pt-1">{s}</span></li>))}</ol>
      <div className="mt-6 flex flex-wrap gap-3">
        <a href="https://iris.fbr.gov.pk" target="_blank" rel="noopener noreferrer" className="rounded-full bg-signal px-6 py-3 text-sm font-semibold text-white transition hover:bg-ember hover:shadow-lg focus-ring">Open FBR IRIS Portal</a>
        <a href={waLink("Hi TaxTrax, I need help checking my NTN / filer status.")} target="_blank" rel="noopener noreferrer" className="rounded-full bg-[#25D366] px-6 py-3 text-sm font-medium text-white transition hover:brightness-95 focus-ring">WhatsApp Help</a>
      </div>
      <RefTable title="Why NTN Matters" head={["Status", "Benefit", "WHT Rate"]} rows={[["Active Filer", "Full WHT benefit", "Lower rates apply"], ["Non-Filer", "Higher deductions", "2× standard rate"], ["No NTN", "Cannot file returns", "Highest rates"]]} />
      <div className="mt-6 rounded-2xl bg-gradient-to-br from-graphite to-night p-5 text-white">
        <p className="font-serif text-lg">Need NTN Registration?</p>
        <p className="mt-1 text-sm text-white/70">TaxTrax Consulting handles complete NTN registration with FBR IRIS within 24 hours.</p>
        <a href={`tel:${OFFICE.phoneTel}`} className="mt-4 inline-block rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-signal transition hover:shadow-lg focus-ring">Call {OFFICE.phoneDisplay}</a>
      </div>
    </div>
  );
}

/* ---------- USA ---------- */
export function UsCalc() {
  const [gross, setGross] = useState(""); const [st, setSt] = useState<T.UsStatus>("single"); const g = toNum(gross), r = g > 0 ? T.usTax(g, st) : null;
  const S = T.US_STATUS[st];
  return (
    <div>
      <p className="text-sm text-smoke">US federal income tax · Tax Year 2026 (filed in 2027)</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Money label="Annual Gross Income (USD)" value={gross} onChange={setGross} placeholder="e.g. 85,000" hint="Wages + business income before deductions" />
        <Pick label="Filing Status" value={st} onChange={(v) => setSt(v as T.UsStatus)} options={[{ value: "single", label: "Single" }, { value: "mfj", label: "Married filing jointly" }]} />
      </div>
      {r ? <Results><Row label="Gross income" value={usd(g)} /><Row label="Standard deduction" value={usd(S.deduction)} /><Row label="Taxable income" value={usd(r.taxable)} /><Row label="Federal income tax" value={usd(r.tax)} strong /><Row label="Marginal bracket" value={pct(r.marginal, 0)} /><Row label="Effective rate" value={pct(r.effective, 1)} /><Row label="After federal tax" value={usd(r.net)} strong /></Results> : <Empty text="Enter your income to estimate federal tax." />}
      <RefTable title={`2026 Federal Brackets (${S.label})`} head={["Taxable income", "Rate"]} rows={S.brackets.map(([lo, hi, rt]) => [hi === Infinity ? `Over ${usd(lo)}` : `${usd(lo)} – ${usd(hi)}`, pct(rt, 0)])} />
      {r && <Actions title="US Federal Tax Estimate" lines={[`Gross: ${usd(g)}`, `Taxable: ${usd(r.taxable)}`, `Federal tax: ${usd(r.tax)}`, `Effective rate: ${pct(r.effective, 1)}`]} trigger="Running a US LLC or selling to US customers? We handle EIN, Form 5472 and annual filings." />}
      <Disclaimer>Federal income tax only: excludes state tax, Social Security/Medicare, credits and itemised deductions. Non-resident LLC owners are taxed differently, so ask us.</Disclaimer>
    </div>
  );
}

/* ---------- UK ---------- */
export function UkCalc() {
  const [gross, setGross] = useState(""); const g = toNum(gross), r = g > 0 ? T.ukTax(g) : null;
  return (
    <div>
      <p className="text-sm text-smoke">UK income tax & National Insurance · 2026/27 (England, Wales & NI)</p>
      <div className="mt-5"><Money label="Annual Gross Salary (GBP)" value={gross} onChange={setGross} placeholder="e.g. 55,000" /></div>
      {r ? <Results><Row label="Gross salary" value={gbp(g)} /><Row label="Personal allowance" value={gbp(r.pa)} /><Row label="Taxable income" value={gbp(r.taxable)} /><Row label="Income tax" value={gbp(r.tax)} /><Row label="National Insurance (Class 1)" value={gbp(r.ni)} /><Row label="Take-home pay (annual)" value={gbp(r.net)} strong /><Row label="Take-home pay (monthly)" value={gbp(r.net / 12)} /><Row label="Effective deduction rate" value={pct(r.effective, 1)} /></Results> : <Empty text="Enter your salary to estimate tax and take-home pay." />}
      <RefTable title="2026/27 Income Tax Bands" head={["Band", "Income", "Rate"]} rows={[["Personal allowance", "Up to £12,570", "0%"], ["Basic rate", "£12,571 – £50,270", "20%"], ["Higher rate", "£50,271 – £125,140", "40%"], ["Additional rate", "Over £125,140", "45%"]]} />
      {r && <Actions title="UK Tax Estimate" lines={[`Gross: ${gbp(g)}`, `Income tax: ${gbp(r.tax)}`, `NI: ${gbp(r.ni)}`, `Take-home: ${gbp(r.net)}`]} trigger="Want to run your business through a UK Ltd? We register with Companies House, HMRC and VAT." />}
      <Disclaimer>Excludes Scottish rates, pension, student loan and benefits. Allowance tapers above £100,000.</Disclaimer>
    </div>
  );
}

/* ---------- UAE ---------- */
export function UaeCalc() {
  const [mode, setMode] = useState("ct"); const [v, setV] = useState(""); const [vm, setVm] = useState<"add" | "remove">("add"); const n = toNum(v);
  const ct = n > 0 && mode === "ct" ? T.uaeCorporateTax(n) : null, vat = n > 0 && mode === "vat" ? T.uaeVat(n, vm) : null;
  return (
    <div>
      <p className="text-sm text-smoke">UAE Corporate Tax (9%) and VAT (5%)</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Pick label="Calculator" value={mode} onChange={setMode} options={[{ value: "ct", label: "Corporate Tax (9%)" }, { value: "vat", label: "VAT (5%)" }]} />
        {mode === "vat" && <Pick label="Mode" value={vm} onChange={(x) => setVm(x as "add" | "remove")} options={[{ value: "add", label: "Add VAT (exclusive)" }, { value: "remove", label: "Remove VAT (inclusive)" }]} />}
        <div className="sm:col-span-2"><Money label={mode === "ct" ? "Annual Taxable Profit (AED)" : "Amount (AED)"} value={v} onChange={setV} placeholder="e.g. 1,000,000" /></div>
      </div>
      {ct ? <Results><Row label="Taxable profit" value={aed(n)} /><Row label="Exempt (first AED 375,000 at 0%)" value={aed(Math.min(n, 375000))} /><Row label="Taxable above threshold" value={aed(ct.taxable)} /><Row label="Corporate tax @ 9%" value={aed(ct.tax)} strong /><Row label="Profit after tax" value={aed(ct.net)} strong /><Row label="Effective rate" value={pct(ct.effective, 2)} /></Results>
        : vat ? <Results><Row label="Net amount" value={aed(vat.base)} /><Row label="VAT @ 5%" value={aed(vat.gst)} /><Row label="Total" value={aed(vat.total)} strong /></Results> : <Empty text="Enter an amount to calculate." />}
      <RefTable title="UAE Tax Rates" head={["Tax", "Rate", "Notes"]} rows={[["Corporate Tax", "0%", "Taxable profit up to AED 375,000"], ["Corporate Tax", "9%", "Taxable profit above AED 375,000"], ["Qualifying Free Zone Income", "0%", "If conditions are met"], ["VAT", "5%", "Standard rate"]]} />
      {(ct || vat) && <Actions title="UAE Tax Estimate" lines={ct ? [`Profit: ${aed(n)}`, `CT @9%: ${aed(ct.tax)}`] : [`VAT @5%: ${aed(vat!.gst)}`, `Total: ${aed(vat!.total)}`]} trigger="Need FTA registration, quarterly VAT returns or Freezone advice? Book a consultation." />}
      <Disclaimer>Small Business Relief, free-zone conditions and group rules can change the result.</Disclaimer>
    </div>
  );
}

import type { CalcId } from "@/lib/calc-meta";
export const COMPONENTS: Record<CalcId, () => JSX.Element> = {
  "pk-salary": PkSalary, "pk-gst": PkGst, "pk-business": PkBusiness, "pk-wht": PkWht, "pk-ntn": NtnChecker,
  "us-tax": UsCalc, "uk-tax": UkCalc, "uae-tax": UaeCalc,
};
