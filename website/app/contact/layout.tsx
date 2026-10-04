import { pageMeta, breadcrumbLd } from "@/lib/seo";
import JsonLd from "@/components/JsonLd";

export const metadata = pageMeta({ title: 'Contact TaxTrax Consulting', description: 'Get in touch with TaxTrax by WhatsApp, email or the contact form for tax filing, company registration and cross-border compliance help.', path: '/contact', noindex: false });

export default function Layout({ children }: { children: React.ReactNode }) {
  return (<><JsonLd data={breadcrumbLd([{ name: "Home", path: "/" }, { name: 'Contact TaxTrax Consulting', path: '/contact' }])} />{children}</>);
}
