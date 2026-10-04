import { pageMeta, breadcrumbLd, SITE_URL } from "@/lib/seo";
import { services } from "@/lib/data";
import JsonLd from "@/components/JsonLd";

export const metadata = pageMeta({
  title: "Tax & Company Services: FBR, SECP, USA LLC, UK Ltd, UAE VAT",
  description: "Explore TaxTrax services: FBR income tax and sales tax filing, SECP company registration, USA LLC formation, UK Ltd registration and UAE VAT & corporate tax, with clear deliverables for each.",
  path: "/services",
  keywords: ["tax services Pakistan", "company registration SECP", "USA LLC formation", "UK company formation", "UAE VAT registration"],
});

export default function Layout({ children }: { children: React.ReactNode }) {
  const ld = [
    breadcrumbLd([{ name: "Home", path: "/" }, { name: "Services", path: "/services" }]),
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      itemListElement: services.map((s, i) => ({
        "@type": "ListItem",
        position: i + 1,
        item: {
          "@type": "Service",
          name: s.title,
          url: `${SITE_URL}/services#${s.slug}`,
          audience: { "@type": "Audience", audienceType: s.audience },
          description: s.deliverables.join(". "),
          provider: { "@id": `${SITE_URL}/#organization` },
        },
      })),
    },
  ];
  return (<><JsonLd data={ld} />{children}</>);
}
