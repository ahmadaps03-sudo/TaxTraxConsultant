import { pageMeta, breadcrumbLd } from "@/lib/seo";
import JsonLd from "@/components/JsonLd";

const base = pageMeta({ title: 'Tax Insights & Guides', description: 'Practical guides on ATL status, US LLCs for non-residents, UAE Freezone tax and more from the TaxTrax advisory team.', path: '/blog', noindex: false });
export const metadata = { ...base, alternates: { ...base.alternates, types: { "application/rss+xml": "/blog/feed.xml" } } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return (<><JsonLd data={breadcrumbLd([{ name: "Home", path: "/" }, { name: 'Tax Insights & Guides', path: '/blog' }])} />{children}</>);
}
