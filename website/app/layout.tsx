import type { Metadata, Viewport } from "next";
import { Source_Serif_4, IBM_Plex_Sans, Noto_Nastaliq_Urdu } from "next/font/google";
import "./globals.css";
import { I18nProvider } from "@/lib/i18n";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import WhatsAppWidget from "@/components/WhatsAppWidget";
import JsonLd from "@/components/JsonLd";
import CtaBand from "@/components/CtaBand";
import { CalculatorProvider } from "@/components/calculators/CalculatorProvider";
import Analytics from "@/components/Analytics";
import { OFFICE } from "@/lib/contact";
import { SITE_URL, SITE_NAME, SITE_TAGLINE, LOGO_URL } from "@/lib/seo";

const display = Source_Serif_4({ subsets: ["latin"], variable: "--font-display", weight: ["500", "600", "700"] });
const body = IBM_Plex_Sans({ subsets: ["latin"], variable: "--font-body", weight: ["400", "500", "600"] });
const urdu = Noto_Nastaliq_Urdu({ subsets: ["arabic"], variable: "--font-urdu", weight: ["400", "700"], preload: false, display: "swap" });

const DESCRIPTION =
  "TaxTrax Consulting brings together the best in tax services: FBR income & sales tax filing, SECP company registration, USA LLC formation, UK Ltd registration, and UAE VAT & corporate tax, handled by chartered accountants and enrolled agents.";

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#FF0404" };

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "TaxTrax Consulting | FBR, SECP, USA LLC, UK Ltd & UAE Tax Services", template: "%s | TaxTrax Consulting" },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "tax consultant Pakistan", "FBR income tax return filing", "ATL status restoration", "sales tax registration STRN",
    "SECP company registration", "USA LLC for Pakistanis", "Wyoming LLC formation", "Form 5472 filing",
    "UK Ltd company registration", "HMRC VAT registration", "UAE corporate tax registration", "UAE VAT filing",
    "cross-border tax advisory", "salary tax calculator Pakistan",
  ],
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: "Tax and accounting services",
  alternates: { canonical: "/" },
  openGraph: { type: "website", url: "/", siteName: SITE_NAME, title: "TaxTrax Consulting | " + SITE_TAGLINE, description: DESCRIPTION, locale: "en_US" },
  twitter: { card: "summary_large_image", title: "TaxTrax Consulting | " + SITE_TAGLINE, description: DESCRIPTION },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } },
  icons: { icon: "/logo/taxtrax-mark.png", apple: "/logo/taxtrax-mark.png" },
  formatDetection: { telephone: false },
  // verification: { google: "PASTE_GOOGLE_SEARCH_CONSOLE_TOKEN", other: { "msvalidate.01": "PASTE_BING_TOKEN" } },
};

const orgLd = [
  {
    "@context": "https://schema.org",
    "@type": ["ProfessionalService", "AccountingService"],
    "@id": `${SITE_URL}/#organization`,
    name: SITE_NAME,
    url: SITE_URL,
    logo: LOGO_URL,
    image: LOGO_URL,
    slogan: SITE_TAGLINE,
    description: DESCRIPTION,
    areaServed: ["Pakistan", "United States", "United Kingdom", "United Arab Emirates"],
    knowsLanguage: ["en", "ur"],
    serviceType: ["Income tax return filing", "Sales tax registration", "Company registration", "USA LLC formation", "UK company formation", "UAE VAT and corporate tax"],
    telephone: OFFICE.phoneTel,
    email: OFFICE.email,
    address: { "@type": "PostalAddress", streetAddress: OFFICE.street, addressLocality: OFFICE.city, postalCode: OFFICE.postalCode, addressCountry: "PK" },
    openingHoursSpecification: [{ "@type": "OpeningHoursSpecification", dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Saturday"], opens: "09:00", closes: "18:00" }, { "@type": "OpeningHoursSpecification", dayOfWeek: "Friday", opens: "09:00", closes: "12:30" }],
    // Add before launch: sameAs (social profile URLs)
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    url: SITE_URL,
    name: SITE_NAME,
    publisher: { "@id": `${SITE_URL}/#organization` },
    inLanguage: ["en", "ur"],
  },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${urdu.variable}`}>
      <body className="bg-ink text-paper antialiased">
        <JsonLd data={orgLd} />
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-full focus:bg-signal focus:px-4 focus:py-2 focus:text-white">Skip to content</a>
        <I18nProvider>
         <CalculatorProvider>
          <Navbar />
          <main id="main">{children}</main>
          <CtaBand />
        <Footer />
          <WhatsAppWidget />
        <Analytics />
         </CalculatorProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
