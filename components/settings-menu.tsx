"use client";

import * as React from "react";
import { Menu, Check } from "lucide-react";
import { Card, Button, Pill } from "@/components/ui";
import { LANGUAGES } from "@/lib/i18n";
import { useLanguage } from "@/components/language-provider";
import { useTheme } from "next-themes";
import { signIn, useSession } from "next-auth/react";

export function SettingsMenu() {
  const { lang, setLang, t } = useLanguage();
  const { theme, setTheme } = useTheme();
  const { data: session } = useSession();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!open) return;
      if (!ref.current) return;
      if (ref.current.contains(e.target as Node)) return;
      setOpen(false);
    }
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
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
              <div className="text-xs font-medium text-muted">{t(lang, "language")}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {LANGUAGES.map((L) => {
                  const active = L.code === lang;
                  return (
                    <button
                      key={L.code}
                      onClick={() => {
                        setLang(L.code);
                        setOpen(false);
                        // Translation requires auth (so we can enforce per-user limits).
                        if (L.code !== "en" && !session) {
                          signIn("google");
                        }
                      }}
                      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm transition focus-ring ${
                        active ? "border-[hsl(var(--accent)/.35)] bg-black/20" : "border-soft hover:bg-white/5"
                      }`}
                    >
                      <span className="truncate max-w-[10rem]">{L.nativeLabel}</span>
                      {active ? <Check size={14} className="text-[hsl(var(--accent))]" /> : null}
                    </button>
                  );
                })}
              </div>
            </div>

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

            <div className="text-xs text-muted">
              UI text uses built-in translations. Feed content + AI summaries translate when you sign in.
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
