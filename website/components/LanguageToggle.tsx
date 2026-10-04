"use client";

import { useI18n } from "@/lib/i18n";

export default function LanguageToggle() {
  const { lang, setLang } = useI18n();
  return (
    <div className="flex items-center rounded-full border border-hairline bg-white shrink-0 p-0.5 text-[0.72rem]">
      <button
        onClick={() => setLang("en")}
        className={`rounded-full px-2.5 py-1 transition-colors focus-ring ${lang === "en" ? "bg-signal text-white" : "text-graphite/70"}`}
      >
        English
      </button>
      <button
        onClick={() => setLang("ur")}
        className={`rounded-full px-2.5 py-1 transition-colors focus-ring ${lang === "ur" ? "bg-signal text-white" : "text-graphite/70"}`}
      >
        اردو
      </button>
    </div>
  );
}
