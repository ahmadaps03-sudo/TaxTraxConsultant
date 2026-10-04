// Pure tax maths for the calculators (no React), so it can be unit-tested and reused.
// Rates are INDICATIVE and sourced from public Finance Act / IRS / HMRC / FTA publications; verify before filing.

export type Slab = { from: number; to: number; rate: number; fixed: number };
const INF = Number.POSITIVE_INFINITY;

export const PK_SALARY_YEARS = {
  "2026-27": {
    label: "2026–27", act: "Finance Act 2026", surchargeAbove: 0, surchargeRate: 0,
    slabs: [
      { from: 0, to: 600000, rate: 0, fixed: 0 }, { from: 600000, to: 1200000, rate: 0.01, fixed: 0 },
      { from: 1200000, to: 2200000, rate: 0.11, fixed: 6000 }, { from: 2200000, to: 3200000, rate: 0.2, fixed: 116000 },
      { from: 3200000, to: 4100000, rate: 0.25, fixed: 316000 }, { from: 4100000, to: 5600000, rate: 0.29, fixed: 541000 },
      { from: 5600000, to: 7000000, rate: 0.32, fixed: 976000 }, { from: 7000000, to: INF, rate: 0.35, fixed: 1424000 },
    ] as Slab[],
  },
  "2025-26": {
    label: "2025–26", act: "Finance Act 2025", surchargeAbove: 10_000_000, surchargeRate: 0.09,
    slabs: [
      { from: 0, to: 600000, rate: 0, fixed: 0 }, { from: 600000, to: 1200000, rate: 0.01, fixed: 0 },
      { from: 1200000, to: 2200000, rate: 0.11, fixed: 6000 }, { from: 2200000, to: 3200000, rate: 0.23, fixed: 116000 },
      { from: 3200000, to: 4100000, rate: 0.3, fixed: 346000 }, { from: 4100000, to: INF, rate: 0.35, fixed: 616000 },
    ] as Slab[],
  },
} as const;
export type PkYear = keyof typeof PK_SALARY_YEARS;

// Non-salaried individuals / AOPs (indicative)
export const PK_NON_SALARIED: Slab[] = [
  { from: 0, to: 600000, rate: 0, fixed: 0 }, { from: 600000, to: 1200000, rate: 0.15, fixed: 0 },
  { from: 1200000, to: 1600000, rate: 0.2, fixed: 90000 }, { from: 1600000, to: 3200000, rate: 0.3, fixed: 170000 },
  { from: 3200000, to: 5600000, rate: 0.4, fixed: 650000 }, { from: 5600000, to: INF, rate: 0.45, fixed: 1610000 },
];

export function slabTax(income: number, slabs: Slab[]) {
  let idx = 0;
  slabs.forEach((s, i) => { if (income > s.from) idx = i; });
  const s = slabs[idx];
  return { index: idx, slab: s, tax: income <= slabs[0].to ? 0 : s.fixed + (income - s.from) * s.rate };
}

export function salaryTax(annual: number, year: PkYear) {
  const y = PK_SALARY_YEARS[year];
  const { index, slab, tax } = slabTax(annual, y.slabs as Slab[]);
  const surcharge = y.surchargeAbove && annual > y.surchargeAbove ? tax * y.surchargeRate : 0;
  const total = tax + surcharge;
  return { index, slab, tax, surcharge, total, monthly: total / 12, net: annual - total, netMonthly: (annual - total) / 12, effective: annual ? total / annual : 0 };
}

export const GST_RATES = [
  { label: "18% — Standard Rate (Goods)", rate: 0.18 }, { label: "13% — Petroleum Products", rate: 0.13 },
  { label: "17% — Services (Punjab, PRA)", rate: 0.17 }, { label: "16% — Services (Sindh, SRB)", rate: 0.16 },
  { label: "15% — Services (KP / Balochistan)", rate: 0.15 }, { label: "8% — Edible Oils", rate: 0.08 }, { label: "0% — Zero-rated Exports", rate: 0 },
];
export function gst(amount: number, rate: number, mode: "add" | "remove") {
  if (mode === "add") return { base: amount, gst: amount * rate, total: amount * (1 + rate) };
  const base = amount / (1 + rate);
  return { base, gst: amount - base, total: amount };
}

export type BizType = "company" | "aop" | "sme";
export function businessTax(type: BizType, revenue: number, expenses: number) {
  const taxable = Math.max(0, revenue - expenses);
  let tax: number, label: string, rate: number;
  if (type === "aop") { tax = slabTax(taxable, PK_NON_SALARIED).tax; label = "Slab-based (individual / AOP)"; rate = taxable ? tax / taxable : 0; }
  else if (type === "sme" && revenue < 250_000_000) { rate = 0.2; tax = taxable * rate; label = "20% small-company rate"; }
  else { rate = 0.29; tax = taxable * rate; label = "29% corporate rate"; }
  const asCompany = taxable * 0.29;
  return { taxable, tax, rate, label, net: taxable - tax, effective: taxable ? tax / taxable : 0, asCompany, saving: type === "aop" ? tax - asCompany : 0 };
}

export const WHT_RATES = [
  { label: "Supply of Goods", filer: 0.055 }, { label: "Rendering of Services", filer: 0.09 },
  { label: "Execution of Contracts", filer: 0.075 }, { label: "Property Rent (company / AOP)", filer: 0.15 },
];

export const US_STATUS = {
  single: { label: "Single", deduction: 16100, brackets: [[0, 12400, 0.1], [12400, 50400, 0.12], [50400, 105700, 0.22], [105700, 201775, 0.24], [201775, 256225, 0.32], [256225, 640600, 0.35], [640600, INF, 0.37]] },
  mfj: { label: "Married filing jointly", deduction: 32200, brackets: [[0, 24800, 0.1], [24800, 100800, 0.12], [100800, 211400, 0.22], [211400, 403550, 0.24], [403550, 512450, 0.32], [512450, 768700, 0.35], [768700, INF, 0.37]] },
} as const;
export type UsStatus = keyof typeof US_STATUS;
export function usTax(gross: number, status: UsStatus) {
  const st = US_STATUS[status], taxable = Math.max(0, gross - st.deduction);
  let tax = 0, marginal = 0.1;
  for (const [lo, hi, r] of st.brackets) if (taxable > lo) { tax += (Math.min(taxable, hi) - lo) * r; marginal = r; }
  return { taxable, tax, marginal, effective: gross ? tax / gross : 0, net: gross - tax };
}

export function ukTax(gross: number) {
  const pa = Math.max(0, gross > 100000 ? 12570 - (gross - 100000) / 2 : 12570);
  const taxable = Math.max(0, gross - pa);
  const tax = 0.2 * Math.min(taxable, 37700) + 0.4 * Math.max(0, Math.min(taxable, 125140) - 37700) + 0.45 * Math.max(0, taxable - 125140);
  const ni = 0.08 * Math.max(0, Math.min(gross, 50270) - 12570) + 0.02 * Math.max(0, gross - 50270);
  return { pa, taxable, tax, ni, net: gross - tax - ni, effective: gross ? (tax + ni) / gross : 0 };
}

export const uaeCorporateTax = (profit: number) => {
  const taxable = Math.max(0, profit - 375000), tax = taxable * 0.09;
  return { taxable, tax, net: profit - tax, effective: profit > 0 ? tax / profit : 0 };
};
export const uaeVat = (amount: number, mode: "add" | "remove") => gst(amount, 0.05, mode);
