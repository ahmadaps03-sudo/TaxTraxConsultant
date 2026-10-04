import { pageMeta, breadcrumbLd, SITE_URL } from "@/lib/seo";
import JsonLd from "@/components/JsonLd";

export const metadata = pageMeta({ title: 'Sales Tax / GST Calculator (FBR, PRA, SRB)', description: 'Work out base price, sales tax and final billing amount for federal and provincial rates, inclusive or exclusive.', path: "/tools/sales-tax-calculator", keywords: ['Sales Tax / GST Calculator (FBR, PRA, SRB)'] });

export default function Layout({ children }: { children: React.ReactNode }) {
  const ld = [
    breadcrumbLd([{ name: "Home", path: "/" }, { name: "Tools", path: "/tools" }, { name: 'Sales Tax / GST Calculator (FBR, PRA, SRB)', path: "/tools/sales-tax-calculator" }]),
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: 'Sales Tax / GST Calculator (FBR, PRA, SRB)',
      description: 'Work out base price, sales tax and final billing amount for federal and provincial rates, inclusive or exclusive.',
      url: `${SITE_URL}/tools/sales-tax-calculator`,
      applicationCategory: "FinanceApplication",
      operatingSystem: "Any",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      provider: { "@id": `${SITE_URL}/#organization` },
    },
  ];
  return (<><JsonLd data={ld} />{children}</>);
}
