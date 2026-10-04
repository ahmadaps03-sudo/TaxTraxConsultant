import type { Metadata } from "next";

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://taxtraxconsulting.com").replace(/\/$/, "");
export const SITE_NAME = "TaxTrax Consulting";
export const SITE_TAGLINE = "Bringing Together the Best in Tax Services";
export const LOGO_URL = `${SITE_URL}/logo/taxtrax-mark.png`;

/** Per-page metadata helper: canonical + Open Graph + Twitter, all in one place. */
export function pageMeta(opts: {
  title: string;
  description: string;
  path: string;
  keywords?: string[];
  noindex?: boolean;
  type?: "website" | "article";
}): Metadata {
  const { title, description, path, keywords, noindex, type = "website" } = opts;
  return {
    title,
    description,
    keywords,
    alternates: { canonical: path },
    openGraph: { title, description, url: path, type, siteName: SITE_NAME, locale: "en_US" },
    twitter: { card: "summary_large_image", title, description },
    robots: noindex ? { index: false, follow: false, nocache: true } : undefined,
  };
}

export function breadcrumbLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: `${SITE_URL}${it.path}`,
    })),
  };
}
