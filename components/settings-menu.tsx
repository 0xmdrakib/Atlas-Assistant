"use client";

import * as React from "react";
import { Menu, Globe, Search, Check, ChevronDown } from "lucide-react";
import { Card, Button, Pill } from "@/components/ui";
import { LANGUAGES, languageByCode } from "@/lib/i18n";
import { useLanguage } from "@/components/language-provider";
import { useTheme } from "next-themes";

const UI_CACHE_VER = "1";
function uiCacheKey(lang: string) {
  return `atlas:ui:${lang}:v${UI_CACHE_VER}`;
}

function normalize(s: string) {
  return s.toLowerCase().trim();
}

export function SettingsMenu() {
  const { lang, setLang, t } = useLanguage();
  const { theme, setTheme } = useTheme();

  const [open, setOpen] = React.useState(false);
  const [langOpen, setLangOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const ref = React.useRef<HTMLDivElement | null>(null);
  const langBtnRef = React.useRef<HTMLButtonElement | null>(null);

  const [langSide, setLangSide] = React.useState<"top" | "bottom">("bottom");
  const [langMaxH, setLangMaxH] = React.useState(420);

  const current = languageByCode(lang) ?? { code: lang, label: lang, nativeLabel: lang, speechLang: lang };

  const prefetchUiTranslations = React.useCallback(async (target: string) => {
    // en & bn are bundled; others are fetched once and cached in localStorage.
    if (!target || target === "en" || target === "bn") return;
    try {
      if (localStorage.getItem(uiCacheKey(target))) return;
      const r = await fetch("/api/ui/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang: target }),
      });
      if (!r.ok) return;
      const data = await r.json().catch(() => null);
      if (data?.ok && data?.strings && typeof data.strings === "object") {
        localStorage.setItem(uiCacheKey(target), JSON.stringify(data.strings));
      }
    } catch {
      // ignore
    }
  }, []);

  const filtered = React.useMemo(() => {
    const q = normalize(query);
    if (!q) return LANGUAGES;
    return LANGUAGES.filter((l) => {
      const hay = `${l.code} ${l.label} ${l.nativeLabel}`;
      return normalize(hay).includes(q);
    });
  }, [query]);

  React.useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!open) return;
      if (!ref.current) return;
      if (ref.current.contains(e.target as Node)) return;
      setOpen(false);
      setLangOpen(false);
    }
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  React.useEffect(() => {
    if (!open) setLangOpen(false);
  }, [open]);

  const computeLangPlacement = React.useCallback(() => {
    const el = langBtnRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    // Approx. header + padding + gap + list. Keep the list flexible via maxHeight.
    const desiredListMax = 420;
    const chrome = 56 /* search */ + 24 /* padding */ + 10 /* gap */;
    const needed = chrome + desiredListMax;

    const preferBottom = spaceBelow >= needed || spaceBelow >= spaceAbove;
    const side: "top" | "bottom" = preferBottom ? "bottom" : "top";
    setLangSide(side);

    const available = preferBottom ? spaceBelow : spaceAbove;
    const maxH = Math.max(220, Math.min(desiredListMax, available - chrome - 12));
    setLangMaxH(maxH);
  }, []);

  React.useEffect(() => {
    if (!langOpen) return;

    computeLangPlacement();

    const on = () => computeLangPlacement();
    window.addEventListener("resize", on);
    window.addEventListener("scroll", on, true);
    return () => {
      window.removeEventListener("resize", on);
      window.removeEventListener("scroll", on, true);
    };
  }, [langOpen, computeLangPlacement]);

  return (
    <div className="relative" ref={ref}>
      <Button variant="ghost" className="gap-2" onClick={() => setOpen((v) => !v)} aria-label={t(lang, "settings")}>
        <Menu size={16} />
        <span className="hidden sm:inline">{t(lang, "settings")}</span>
      </Button>

      {open ? (
        <Card className="absolute right-0 mt-2 w-[320px] p-4 shadow-xl">
          <div className="space-y-4">
            <div>
              <div className="text-xs font-medium text-muted">{t(lang, "theme")}</div>
              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={() => setTheme("dark")}
                  className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition focus-ring ${
                    theme === "dark" ? "border-[hsl(var(--accent)/.35)] bg-black/20" : "border-soft hover:bg-white/5"
                  }`}
                >
                  {t(lang, "dark")}
                  {theme === "dark" ? <Pill>✓</Pill> : null}
                </button>
                <button
                  onClick={() => setTheme("light")}
                  className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition focus-ring ${
                    theme === "light" ? "border-[hsl(var(--accent)/.35)] bg-black/20" : "border-soft hover:bg-white/5"
                  }`}
                >
                  {t(lang, "light")}
                  {theme === "light" ? <Pill>✓</Pill> : null}
                </button>
              </div>
            </div>

            <div className="pt-2 border-t border-soft">
              <div className="relative">
                <button
                  ref={langBtnRef}
                  onClick={() => setLangOpen((v) => !v)}
                  className="inline-flex w-full items-center justify-between rounded-xl border border-soft bg-white/5 px-3 py-2 text-sm transition focus-ring hover:bg-white/10"
                >
                  <span className="inline-flex items-center gap-2">
                    <Globe size={16} />
                    <span className="truncate">{current.label}</span>
                  </span>
                  <ChevronDown size={16} className={`transition ${langOpen ? "rotate-180" : ""}`} />
                </button>

                {langOpen ? (
                  <div
                    className={`absolute right-0 z-50 w-[340px] overflow-hidden rounded-2xl border border-soft bg-black/70 shadow-2xl backdrop-blur ${
                      langSide === "bottom" ? "top-[calc(100%+10px)]" : "bottom-[calc(100%+10px)]"
                    }`}
                  >
                    <div className="p-3 border-b border-soft">
                      <div className="flex items-center gap-2 rounded-xl border border-soft bg-white/5 px-3 py-2">
                        <Search size={16} className="text-muted" />
                        <input
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder={t(lang, "searchLanguage")}
                          className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
                          autoFocus
                        />
                      </div>
                    </div>

                    <div className="overflow-auto" style={{ maxHeight: langMaxH }}>
                      {filtered.map((L) => {
                        const active = L.code === lang;
                        return (
                          <button
                            key={L.code}
                            onClick={async () => {
                              const next = L.code;
                              const changed = next !== lang;

                              // Fetch UI strings for the target language (if needed) BEFORE refresh.
                              // This makes the post-refresh UI immediately render in the selected language.
                              if (changed) await prefetchUiTranslations(next);

                              setLang(next);
                              setLangOpen(false);
                              setOpen(false);

                              // Product requirement: language change should take effect immediately.
                              // A lightweight full refresh is the most reliable way to ensure all
                              // client caches/state re-request /api/items with the new lang.
                              if (changed) setTimeout(() => window.location.reload(), 0);
                            }}
                            className={`w-full px-4 py-3 text-left transition focus-ring ${
                              active ? "bg-white/10" : "hover:bg-white/5"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="min-w-0">
                                <div className="truncate text-sm">{L.nativeLabel}</div>
                                <div className="truncate text-xs text-muted">{L.label}</div>
                              </div>
                              {active ? <Check size={16} className="mt-0.5 text-[hsl(var(--accent))]" /> : null}
                            </div>
                          </button>
                        );
                      })}
                      {filtered.length === 0 ? (
                        <div className="px-4 py-3 text-sm text-muted">{t(lang, "noResults")}</div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
