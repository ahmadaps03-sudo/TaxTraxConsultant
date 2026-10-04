"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export type Lang = "en" | "ur";

type Dict = Record<string, { en: string; ur: string }>;

// Central dictionary. Add a key once, use it everywhere via t("key").
// This is the seam a backend-driven CMS translation table would replace later.
export const dict: Dict = {
  "nav.services": { en: "Services", ur: "خدمات" },
  "nav.tools": { en: "Tools", ur: "کیلکولیٹرز" },
  "nav.blog": { en: "Insights", ur: "بلاگ" },
  "nav.resources": { en: "Resources", ur: "وسائل" },
  "nav.about": { en: "About Us", ur: "ہمارے بارے میں" },
  "nav.contact": { en: "Contact", ur: "رابطہ" },
  "nav.portal": { en: "Client Portal", ur: "کلائنٹ پورٹل" },
  "nav.book": { en: "Book Consultation", ur: "مشاورت بک کریں" },

  "hero.eyebrow": { en: "Tax strategy, compliance, cross-border filings", ur: "ٹیکس حکمت عملی اور تعمیل" },
  "hero.headline": { en: "Eliminate tax stress. Protect what you've built.", ur: "ٹیکس کی پریشانی ختم کریں۔ اپنی محنت کی کمائی محفوظ رکھیں۔" },
  "hero.sub": {
    en: "From strategic year-round planning to complex resolution, our certified tax experts navigate regulatory complexity so you can focus on scaling.",
    ur: "سال بھر کی حکمت عملی سے لے کر پیچیدہ مسائل کے حل تک، ہمارے مستند ٹیکس ماہرین ضابطوں کی پیچیدگی سنبھالتے ہیں تاکہ آپ اپنے کاروبار کو بڑھانے پر توجہ دے سکیں۔",
  },
  "hero.cta.primary": { en: "Book Consultation", ur: "مشاورت بک کریں" },
  "hero.cta.secondary": { en: "Explore Services", ur: "خدمات دیکھیں" },
  "hero.trust1": { en: "Direct access to CPAs & Enrolled Agents", ur: "سی پی اے اور ماہرین تک براہ راست رسائی" },
  "hero.trust2": { en: "Confidential & bank-grade security", ur: "خفیہ اور بینک درجے کی سیکیورٹی" },
  "hero.trust3": { en: "Avg. 18% reduction in tax liability", ur: "اوسطاً 18% ٹیکس میں کمی" },

  "stats.clients": { en: "Companies registered — SECP, USA LLC, UK Ltd", ur: "رجسٹرڈ کمپنیاں" },
  "stats.returns": { en: "Annual income & sales tax returns filed", ur: "سالانہ ٹیکس گوشوارے" },
  "stats.compliance": { en: "Compliance rate on filings we manage", ur: "تعمیل کی شرح" },

  "footer.rights": { en: "All rights reserved.", ur: "جملہ حقوق محفوظ ہیں۔" },
  "footer.disclaimer": {
    en: "TaxTrax Consulting provides tax and corporate advisory services. Rates shown in tools are indicative and follow the latest published Finance Act slabs.",
    ur: "TaxTrax Consulting ٹیکس اور کارپوریٹ مشاورتی خدمات فراہم کرتا ہے۔ کیلکولیٹرز میں دی گئی شرحیں تخمینی ہیں۔",
  },

  "cta.download_pdf": { en: "Download PDF report", ur: "پی ڈی ایف رپورٹ ڈاؤن لوڈ کریں" },
  "cta.send_whatsapp": { en: "Send to WhatsApp Specialist", ur: "واٹس ایپ پر بھیجیں" },
  "cta.get_result": { en: "Get my result", ur: "نتیجہ حاصل کریں" },

  "lang.toggle": { en: "اردو", ur: "English" },
};

interface I18nContextValue {
  lang: Lang;
  dir: "ltr" | "rtl";
  setLang: (l: Lang) => void;
  t: (key: keyof typeof dict | string) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem("taxtrax_lang") : null;
    if (stored === "ur" || stored === "en") setLangState(stored);
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    if (typeof window !== "undefined") window.localStorage.setItem("taxtrax_lang", l);
  };

  const dir = lang === "ur" ? "rtl" : "ltr";

  useEffect(() => {
    document.documentElement.dir = dir;
    document.documentElement.lang = lang;
  }, [dir, lang]);

  const t = (key: string) => {
    const entry = dict[key];
    if (!entry) return key;
    return entry[lang];
  };

  return <I18nContext.Provider value={{ lang, dir, setLang, t }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}
