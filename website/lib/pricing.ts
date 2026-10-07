// Starting prices shown on the site. Edit the numbers here; every card updates.
// Source: TTC_Pricing_Updated.docx. "+" in the document means "starting from",
// which the site already expresses with its "Starting from" label.
export const PRICES: Record<string, { from: string; unit: string; note: string }> = {
  "income-tax-return-fbr": { from: "PKR 4,999", unit: "per tax year", note: "Salaried & pensioners. Freelancers, overseas Pakistanis & sole proprietors from PKR 7,999. AOP from PKR 9,999. Corporate from PKR 19,999+." },
  "sales-tax-registration": { from: "PKR 49,999+", unit: "STRN registration", note: "Monthly sales tax return from PKR 4,999 / month. PST registration (PRA, SRB, KPRA, BRA) from PKR 19,999+." },
  "company-registration-secp": { from: "PKR 24,999+", unit: "Pvt Ltd company", note: "Includes SECP, NTN, MOA/AOA and bank account letter. Sole proprietorship registration from PKR 19,999+." },
  "usa-llc-tax-filing": { from: "$119", unit: "LLC / Inc. formation + state fee", note: "Complete package (formation + EIN + US bank account) $349 + state fee. EIN $159. Federal tax filing $199, state tax filing $199." },
  "uk-ltd-registration": { from: "£39", unit: "per month (or £399 / year)", note: "Starter plan for sole traders & freelancers. Growth (limited companies) £79 / month. Business (with payroll) £149 / month." },
  "uae-vat-corporate-tax": { from: "AED 500", unit: "per registration", note: "VAT or Corporate Tax registration AED 500 – 1,250. VAT return filing from AED 400 / quarter. Corporate tax filing from AED 1,500 / year." },
};
export const FEATURED_SERVICES = ["income-tax-return-fbr", "usa-llc-tax-filing", "uk-ltd-registration"];

export const PLANS = [
  { name: "Individual / Salaried", blurb: "Government employees, private job holders, teachers, doctors and pensioners.", price: "PKR 4,999", unit: "per tax year, starting from", featured: false,
    features: ["FBR IRIS income tax return filing", "Wealth statement preparation", "ATL active filer enrollment", "Acknowledgment certificate", "WhatsApp support included"] },
  { name: "Business / Freelancer", blurb: "Upwork/Fiverr freelancers, sole proprietors, shopkeepers, traders and importers.", price: "PKR 7,999", unit: "per tax year, starting from", featured: true,
    features: ["Business income tax return (IRIS)", "Profit & loss review", "Withholding tax statements", "Foreign income & remittance disclosure", "Wealth statement filing", "WhatsApp support included"] },
  { name: "Corporate / Company", blurb: "Pvt Ltd companies, AOPs, partnerships and NGOs requiring full compliance.", price: "PKR 14,999", unit: "per tax year, starting from", featured: false,
    features: ["Corporate income tax return (IRIS)", "Monthly WHT statements (149/165)", "Monthly sales tax returns (STRS)", "Financial statements preparation", "FBR notice reply included", "WhatsApp support included"] },
];