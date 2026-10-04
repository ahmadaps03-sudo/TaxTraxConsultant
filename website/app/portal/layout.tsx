import { pageMeta, breadcrumbLd } from "@/lib/seo";
import JsonLd from "@/components/JsonLd";

export const metadata = pageMeta({ title: 'Client Portal Login', description: 'Secure TaxTrax client portal.', path: '/portal', noindex: true });

export default function Layout({ children }: { children: React.ReactNode }) {
  return (<><JsonLd data={breadcrumbLd([{ name: "Home", path: "/" }, { name: 'Client Portal Login', path: '/portal' }])} />{children}</>);
}
