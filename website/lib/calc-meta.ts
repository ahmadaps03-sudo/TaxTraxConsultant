// Lightweight calculator metadata (no calculator code), so menus and grids don't load the calculators.
export type CalcId = "pk-salary" | "pk-gst" | "pk-business" | "pk-wht" | "pk-ntn" | "us-tax" | "uk-tax" | "uae-tax";
export const CALC_META: Record<CalcId, { title: string; sub: string; country: "PK" | "USA" | "UK" | "UAE"; icon: string; slug: string | null }> = {
  "pk-salary": { title: "Salary Tax Calculator", sub: "Pakistan · salaried persons", country: "PK", icon: "briefcase", slug: "salary-tax-calculator" },
  "pk-gst": { title: "GST / Sales Tax Calculator", sub: "Pakistan · FBR & provincial", country: "PK", icon: "receipt", slug: "sales-tax-calculator" },
  "pk-business": { title: "Business Tax Estimator", sub: "Pakistan · company, AOP, SME", country: "PK", icon: "chart", slug: "business-tax-estimator" },
  "pk-wht": { title: "Withholding Tax Calculator", sub: "Pakistan · vendor payments", country: "PK", icon: "scissors", slug: "wht-calculator" },
  "pk-ntn": { title: "NTN Status Checker", sub: "Pakistan · FBR IRIS", country: "PK", icon: "search", slug: "filer-status-checker" },
  "us-tax": { title: "US Federal Tax Estimator", sub: "USA · tax year 2026", country: "USA", icon: "landmark", slug: null },
  "uk-tax": { title: "UK Income Tax & NI Calculator", sub: "UK · 2026/27", country: "UK", icon: "pound", slug: null },
  "uae-tax": { title: "UAE Corporate Tax & VAT", sub: "UAE · 9% CT, 5% VAT", country: "UAE", icon: "building", slug: null },
};
export const SLUG_TO_ID: Record<string, CalcId> = Object.fromEntries(
  (Object.entries(CALC_META) as [CalcId, { slug: string | null }][]).filter(([, m]) => m.slug).map(([id, m]) => [m.slug as string, id]),
);
