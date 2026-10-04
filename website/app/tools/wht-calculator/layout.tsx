import { pageMeta, breadcrumbLd, SITE_URL } from "@/lib/seo";
import JsonLd from "@/components/JsonLd";

export const metadata = pageMeta({ title: 'Withholding Tax (WHT) Calculator', description: 'Compute withholding tax on goods, services, contracts and rent for filers and non-filers.', path: "/tools/wht-calculator", keywords: ['Withholding Tax (WHT) Calculator'] });

export default function Layout({ children }: { children: React.ReactNode }) {
  const ld = [
    breadcrumbLd([{ name: "Home", path: "/" }, { name: "Tools", path: "/tools" }, { name: 'Withholding Tax (WHT) Calculator', path: "/tools/wht-calculator" }]),
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: 'Withholding Tax (WHT) Calculator',
      description: 'Compute withholding tax on goods, services, contracts and rent for filers and non-filers.',
      url: `${SITE_URL}/tools/wht-calculator`,
      applicationCategory: "FinanceApplication",
      operatingSystem: "Any",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      provider: { "@id": `${SITE_URL}/#organization` },
    },
  ];
  return (<><JsonLd data={ld} />{children}</>);
}
