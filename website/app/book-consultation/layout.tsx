import { pageMeta, breadcrumbLd } from "@/lib/seo";
import JsonLd from "@/components/JsonLd";

export const metadata = pageMeta({ title: 'Book a Tax Consultation', description: 'Schedule a free tax consultation with certified experts. Choose your service, answer a few quick questions and pick a time that suits you.', path: '/book-consultation', noindex: false });

export default function Layout({ children }: { children: React.ReactNode }) {
  return (<><JsonLd data={breadcrumbLd([{ name: "Home", path: "/" }, { name: 'Book a Tax Consultation', path: '/book-consultation' }])} />{children}</>);
}
