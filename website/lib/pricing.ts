// Starting prices shown on the site. Edit the numbers here; every card updates.
// NOTE: these are market-typical starting figures, set them to the firm's real rates.
export const PRICES: Record<string, { from: string; unit: string; note: string }> = {
  "income-tax-return-fbr": { from: "PKR 7,500", unit: "per return", note: "Salaried & freelancers. Business returns from PKR 15,000." },
  "sales-tax-registration": { from: "PKR 15,000", unit: "one-time registration", note: "Monthly return filing from PKR 8,000 / month." },
  "company-registration-secp": { from: "PKR 35,000", unit: "per company", note: "Includes name reservation, MoA/AoA and NTN." },
  "usa-llc-tax-filing": { from: "$249", unit: "LLC formation + registered agent", note: "State filing fees extra. EIN and annual filings quoted separately." },
  "uk-ltd-registration": { from: "$199", unit: "incorporation + London address", note: "Includes Companies House filing and HMRC/UTR activation." },
  "uae-vat-corporate-tax": { from: "$149", unit: "per registration", note: "VAT or Corporate Tax registration. Quarterly filing quoted separately." },
};
export const FEATURED_SERVICES = ["income-tax-return-fbr", "usa-llc-tax-filing", "uk-ltd-registration"];

export const PLANS = [
  { name: "Individual Filing", blurb: "Salaried people, freelancers and non-residents.", price: "PKR 7,500", unit: "per return", featured: false,
    features: ["FBR IRIS registration & NTN", "Income tax return e-filing", "Wealth statement reconciliation", "Active Taxpayer List (ATL) activation", "Notice reply guidance"] },
  { name: "Business Compliance", blurb: "Ongoing tax compliance for growing businesses.", price: "PKR 15,000", unit: "per month", featured: true,
    features: ["Monthly sales tax & withholding returns", "Annual income tax return", "Input tax & refund optimisation", "Bookkeeping review", "Dedicated advisor on WhatsApp"] },
  { name: "Global Setup", blurb: "Launch in the USA, UK or UAE with local compliance.", price: "$299", unit: "one-time, from", featured: false,
    features: ["USA LLC, UK Ltd or UAE setup", "Registered agent / virtual office", "EIN, UTR or TRN registration", "Bank & payment gateway guidance", "First-year compliance calendar"] },
];
