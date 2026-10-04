import { pageMeta, breadcrumbLd, SITE_URL } from "@/lib/seo";
import JsonLd from "@/components/JsonLd";

export const metadata = pageMeta({ title: 'Business Tax & Profit Estimator', description: 'Estimate tax for sole proprietors, AOPs and private limited companies after expenses, and compare structures.', path: "/tools/business-tax-estimator", keywords: ['Business Tax & Profit Estimator'] });

export default function Layout({ children }: { children: React.ReactNode }) {
  const ld = [
    breadcrumbLd([{ name: "Home", path: "/" }, { name: "Tools", path: "/tools" }, { name: 'Business Tax & Profit Estimator', path: "/tools/business-tax-estimator" }]),
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: 'Business Tax & Profit Estimator',
      description: 'Estimate tax for sole proprietors, AOPs and private limited companies after expenses, and compare structures.',
      url: `${SITE_URL}/tools/business-tax-estimator`,
      applicationCategory: "FinanceApplication",
      operatingSystem: "Any",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      provider: { "@id": `${SITE_URL}/#organization` },
    },
  ];
  return (<><JsonLd data={ld} />{children}</>);
}
