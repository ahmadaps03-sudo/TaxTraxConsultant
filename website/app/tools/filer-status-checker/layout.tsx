import { pageMeta, breadcrumbLd, SITE_URL } from "@/lib/seo";
import JsonLd from "@/components/JsonLd";

export const metadata = pageMeta({ title: 'NTN & ATL Filer Status Checker Guide', description: 'Learn how to verify your NTN, STRN and Active Taxpayer List status on the FBR portal.', path: "/tools/filer-status-checker", keywords: ['NTN & ATL Filer Status Checker Guide'] });

export default function Layout({ children }: { children: React.ReactNode }) {
  const ld = [
    breadcrumbLd([{ name: "Home", path: "/" }, { name: "Tools", path: "/tools" }, { name: 'NTN & ATL Filer Status Checker Guide', path: "/tools/filer-status-checker" }]),
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: 'NTN & ATL Filer Status Checker Guide',
      description: 'Learn how to verify your NTN, STRN and Active Taxpayer List status on the FBR portal.',
      url: `${SITE_URL}/tools/filer-status-checker`,
      applicationCategory: "FinanceApplication",
      operatingSystem: "Any",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      provider: { "@id": `${SITE_URL}/#organization` },
    },
  ];
  return (<><JsonLd data={ld} />{children}</>);
}
