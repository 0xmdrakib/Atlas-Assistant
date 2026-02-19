"use client";

import * as React from "react";
import { Menu, Globe, Search, Check, ChevronUp } from "lucide-react";
import { Card, Button, Pill } from "@/components/ui";
import { LANGUAGES, languageByCode } from "@/lib/i18n";
import { useLanguage } from "@/components/language-provider";
import { useTheme } from "next-themes";

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

  const current = languageByCode(lang) ?? { code: lang, label: lang, nativeLabel: lang, speechLang: lang };

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
                  onClick={() => setLangOpen((v) => !v)}
                  className="inline-flex w-full items-center justify-between rounded-xl border border-soft bg-white/5 px-3 py-2 text-sm transition focus-ring hover:bg-white/10"
                >
                  <span className="inline-flex items-center gap-2">
                    <Globe size={16} />
                    <span className="truncate">{current.label}</span>
                  </span>
                  <ChevronUp size={16} className={`transition ${langOpen ? "rotate-180" : ""}`} />
                </button>

                {langOpen ? (
                  <div className="absolute right-0 bottom-[calc(100%+10px)] z-50 w-[340px] overflow-hidden rounded-2xl border border-soft bg-black/70 shadow-2xl backdrop-blur">
                    <div className="p-3 border-b border-soft">
                      <div className="flex items-center gap-2 rounded-xl border border-soft bg-white/5 px-3 py-2">
                        <Search size={16} className="text-muted" />
                        <input
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder="Search language…"
                          className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
                          autoFocus
                        />
                      </div>
                    </div>

                    <div className="max-h-[420px] overflow-auto">
                      {filtered.map((L) => {
                        const active = L.code === lang;
                        return (
                          <button
                            key={L.code}
                            onClick={() => {
                              setLang(L.code);
                              setLangOpen(false);
                              setOpen(false);
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
                        <div className="px-4 py-3 text-sm text-muted">No results.</div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="mt-2 text-xs text-muted">
                UI text uses built-in translations. Feed content, summaries, and digests translate via Gemini when enabled.
              </div>
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
