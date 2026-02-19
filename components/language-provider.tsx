"use client";

import * as React from "react";
import type { LangCode } from "@/lib/i18n";
import { t as translate, getSpeechLang } from "@/lib/i18n";

type LanguageState = {
  lang: LangCode;
  setLang: (lang: LangCode) => void;
  t: typeof translate;
  speechLang: string;
};

const LanguageContext = React.createContext<LanguageState | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // Read from localStorage during initial render to avoid a flash of "en" after refresh.
  const [lang, setLangState] = React.useState<LangCode>(() => {
    try {
      const saved = localStorage.getItem("atlas:lang");
      return (saved as LangCode) || "en";
    } catch {
      return "en";
    }
  });

  const setLang = React.useCallback((next: LangCode) => {
    setLangState(next);
    try {
      localStorage.setItem("atlas:lang", next);
    } catch {
      // ignore
    }
  }, []);

  const value = React.useMemo<LanguageState>(() => {
    return {
      lang,
      setLang,
      t: translate,
      speechLang: getSpeechLang(lang),
    };
  }, [lang, setLang]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = React.useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
