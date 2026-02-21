"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import { Globe, Cpu, Lightbulb, Radar, Users, Telescope, BookOpen, Heart} from "lucide-react";
import { cn } from "@/lib/utils";
import { AuthButton } from "@/components/auth-button";
import { SettingsMenu } from "@/components/settings-menu";
import { useLanguage } from "@/components/language-provider";

const tabs = [
  // Global is the default tab, and is served at the root path ("/").
  // We still keep /global as a valid direct URL (handled by app/global).
  { href: "/", labelKey: "tabGlobal" as const, icon: Globe },
  { href: "/tech", labelKey: "tabTech" as const, icon: Cpu },
  { href: "/innovators", labelKey: "tabInnovators" as const, icon: Lightbulb },
  { href: "/early", labelKey: "tabEarly" as const, icon: Radar },
  { href: "/creators", labelKey: "tabCreators" as const, icon: Users },
  { href: "/universe", labelKey: "tabUniverse" as const, icon: Telescope },
  { href: "/history", labelKey: "tabHistory" as const, icon: BookOpen },
  { href: "/faith", labelKey: "tabFaith" as const, icon: Heart },
];

export function TabShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const qs = sp.toString();
  const { lang, t } = useLanguage();

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <header className="mb-7 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <Image
              src="/icon.png"
              alt="Atlas Assistant"
              width={26}
              height={26}
              className="rounded-md"
              priority
            />
            {t(lang, "atlasAssistant")}
          </div>
          <div className="mt-1 text-sm text-muted">{t(lang, "tagline")}</div>
        </div>
        <div className="flex items-center gap-2">
          <AuthButton />
          <SettingsMenu />
        </div>
      </header>

      <nav className="mb-6 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-2">
        {tabs.map((tab) => {
          const active =
            pathname === tab.href ||
            // Treat /global as the same as root for highlighting Global.
            (tab.href === "/" && (pathname === "/" || pathname === "/global"));
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={qs ? `${tab.href}?${qs}` : tab.href}
              className={cn(
                "inline-flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm transition focus-ring sm:w-auto sm:justify-start",
                active
                  ? "border-[hsl(var(--accent)/.35)] bg-wash-55 text-[hsl(var(--fg))]"
                  : "border-soft text-muted hover-wash"
              )}
            >
              <Icon size={16} />
              {t(lang, tab.labelKey)}
            </Link>
          );
        })}
      </nav>

      {children}

      <footer className="mt-10 flex items-center justify-center text-center text-xs text-muted">
        © 2026 Md. Rakib • made with love and passion • All Rights Reserved.
      </footer>
    </div>
  );
}
