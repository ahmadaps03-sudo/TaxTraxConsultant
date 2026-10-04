import { pageMeta, breadcrumbLd, SITE_URL } from "@/lib/seo";
import JsonLd from "@/components/JsonLd";

export const metadata = pageMeta({ title: 'Salary Tax Calculator Pakistan (FBR Slabs)', description: 'Calculate monthly and annual income tax on your salary using FBR slabs, with allowances and net take-home pay.', path: "/tools/salary-tax-calculator", keywords: ['Salary Tax Calculator Pakistan (FBR Slabs)'] });

export default function Layout({ children }: { children: React.ReactNode }) {
  const ld = [
    breadcrumbLd([{ name: "Home", path: "/" }, { name: "Tools", path: "/tools" }, { name: 'Salary Tax Calculator Pakistan (FBR Slabs)', path: "/tools/salary-tax-calculator" }]),
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: 'Salary Tax Calculator Pakistan (FBR Slabs)',
      description: 'Calculate monthly and annual income tax on your salary using FBR slabs, with allowances and net take-home pay.',
      url: `${SITE_URL}/tools/salary-tax-calculator`,
      applicationCategory: "FinanceApplication",
      operatingSystem: "Any",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      provider: { "@id": `${SITE_URL}/#organization` },
    },
  ];
  return (<><JsonLd data={ld} />{children}</>);
}
