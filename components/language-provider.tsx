"use client";

import * as React from "react";
import type { LangCode } from "@/lib/i18n";
import { t as translate, getSpeechLang, languageByCode } from "@/lib/i18n";

const UI_CACHE_VER = "1";
function uiCacheKey(lang: string) {
  return `atlas:ui:${lang}:v${UI_CACHE_VER}`;
}

type LanguageState = {
  lang: LangCode;
  setLang: (lang: LangCode) => void;
  // We wrap the built-in dictionary with optional dynamically-fetched UI strings.
  t: (lang: LangCode, key: any) => string;
  speechLang: string;
};

const LanguageContext = React.createContext<LanguageState | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // Read from localStorage during initial render to avoid a flash of "en" after refresh.
  const [lang, setLangState] = React.useState<LangCode>(() => {
    try {
      const saved = localStorage.getItem("atlas:lang");
      const candidate = (saved as LangCode) || "en";
      return languageByCode(candidate) ? candidate : "en";
    } catch {
      return "en";
    }
  });

  const [uiDict, setUiDict] = React.useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem("atlas:lang");
      const candidate = (saved as LangCode) || "en";
      const code = languageByCode(candidate) ? candidate : "en";
      const raw = localStorage.getItem(uiCacheKey(code));
      return raw ? (JSON.parse(raw) as Record<string, string>) : {};
    } catch {
      return {};
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

  // Load cached UI dictionary for the active language.
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(uiCacheKey(lang));
      setUiDict(raw ? (JSON.parse(raw) as Record<string, string>) : {});
    } catch {
      setUiDict({});
    }
  }, [lang]);

  // Best-effort background fetch for languages that aren't bundled.
  React.useEffect(() => {
    if (lang === "en" || lang === "bn") return;
    try {
      if (localStorage.getItem(uiCacheKey(lang))) return;
    } catch {
      // ignore
    }

    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/ui/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lang }),
        });
        if (!r.ok) return;
        const data = await r.json().catch(() => null);
        if (!data?.ok || !data?.strings || typeof data.strings !== "object") return;
        if (cancelled) return;
        try {
          localStorage.setItem(uiCacheKey(lang), JSON.stringify(data.strings));
        } catch {
          // ignore
        }
        setUiDict(data.strings as Record<string, string>);
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [lang]);

  const value = React.useMemo<LanguageState>(() => {
    return {
      lang,
      setLang,
      t: (l, key) => {
        const fromDynamic = uiDict?.[String(key)];
        return fromDynamic || translate(l, key as any);
      },
      speechLang: getSpeechLang(lang),
    };
  }, [lang, setLang, uiDict]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = React.useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
