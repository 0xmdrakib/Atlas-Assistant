"use client";

import * as React from "react";
import type { ContentItem, Section } from "@/lib/types";
import { Card, Pill, Button, A, Segmented } from "@/components/ui";
import { timeAgo } from "@/lib/utils";
import { Sparkles } from "lucide-react";
import { signIn, useSession } from "next-auth/react";
import { useLanguage } from "@/components/language-provider";
import { SpeakButton } from "@/components/speak-button";

type Days = 1 | 7 | 30;

type Kind = "feed" | "discovery";

type DigestOutput = {
  overview: string;
  themes: string[];
  highlights: string[];
  whyItMatters: string[];
  watchlist: string[];
};

export function Feed({ section }: { section: Section }) {
  const { status } = useSession();
  const authed = status === "authenticated";
  const { lang, t, speechLang } = useLanguage();

  const [items, setItems] = React.useState<ContentItem[]>([]);
  const [country, setCountry] = React.useState("");
  const [topic, setTopic] = React.useState("");
  const [days, setDays] = React.useState<Days>(section === "history" ? 7 : 1);
  const [kind, setKind] = React.useState<Kind>("feed");

  const [aiOpen, setAiOpen] = React.useState<Record<string, boolean>>({});
  const [aiLoading, setAiLoading] = React.useState<Record<string, boolean>>({});

  const [aiSummaryEnabled, setAiSummaryEnabled] = React.useState<boolean | null>(null);
  const [aiDiscoveryEnabled, setAiDiscoveryEnabled] = React.useState<boolean | null>(null);

  const [digestOpen, setDigestOpen] = React.useState(false);
  const [digestLoading, setDigestLoading] = React.useState(false);
  const [digest, setDigest] = React.useState<DigestOutput | null>(null);
  const [digestError, setDigestError] = React.useState<string>("");

  const [last, setLast] = React.useState<string>("");
  const [msg, setMsg] = React.useState<string>("");
  const [loginOpen, setLoginOpen] = React.useState(false);

  function requireLogin(): boolean {
    if (authed) return true;
    setLoginOpen(true);
    return false;
  }

  async function load() {
    const qs = new URLSearchParams();
    qs.set("section", section);
    qs.set("days", String(days));
    qs.set("kind", kind);
    qs.set("lang", lang);
    if (country) qs.set("country", country);
    if (topic) qs.set("topic", topic);

    const res = await fetch(`/api/items?${qs.toString()}`, { cache: "no-store" });
    const json = await res.json();
    const meta = json?.meta || {};

    setItems(Array.isArray(json?.items) ? json.items : []);
    setLast(new Date().toISOString());

    // Language gating (translation)
    if (meta?.requiresLogin) {
      setMsg(t(lang, "translateNeedsLogin"));
      setLoginOpen(true);
    } else if (lang !== "en" && !meta?.translateEnabled) {
      // User is signed in but no AI key to translate
      setMsg(t(lang, "translateNeedsKey"));
    } else {
      setMsg("");
    }

    if (aiSummaryEnabled === null || aiDiscoveryEnabled === null) {
      const s = await fetch(`/api/ai/status`, { cache: "no-store" }).then((r) => r.json());
      setAiSummaryEnabled(Boolean(s?.summaryEnabled));
      setAiDiscoveryEnabled(Boolean(s?.discoveryEnabled));
    }
  }

  // Clamp the window selection per section.
  React.useEffect(() => {
    setDays((prev) => {
      if (section === "history") return (prev === 7 || prev === 30 ? prev : 7) as Days;
      return (prev === 1 || prev === 7 ? prev : 1) as Days;
    });
  }, [section]);

  React.useEffect(() => {
    load().catch(() => setItems([]));
    setDigestOpen(false);
    setDigest(null);
    setDigestError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, country, topic, days, lang, kind]);

  async function ensureDigest() {
    if (!aiSummaryEnabled) return;
    if (!requireLogin()) return;
    if (digest) return;

    setDigestLoading(true);
    setDigestError("");

    try {
      const res = await fetch(`/api/ai/digest`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ section, kind, days, country: country || null, topic: topic || null, lang }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || `Digest failed (${res.status})`);
      setDigest(j?.digest || null);
    } catch (e: any) {
      setDigestError(e?.message || "Digest failed");
    } finally {
      setDigestLoading(false);
    }
  }

  async function ensureAiSummary(id: string) {
    if (!aiSummaryEnabled) return;
    if (!requireLogin()) return;

    setAiLoading((x) => ({ ...x, [id]: true }));
    try {
      const res = await fetch(`/api/ai/summary`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, lang }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || `Summary failed (${res.status})`);

      // reload to show cached fields where appropriate
      await load();
    } catch (e: any) {
      setMsg(e?.message || "Summary failed");
    } finally {
      setAiLoading((x) => ({ ...x, [id]: false }));
    }
  }

  const digestSpeakText = digest
    ? [
        digest.overview,
        ...digest.themes,
        ...digest.highlights,
        ...digest.whyItMatters,
        ...digest.watchlist,
      ].join("\n")
    : "";

  return (
    <div className="space-y-4">
      {loginOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <Card className="w-full max-w-md p-5">
            <div className="text-base font-semibold">{t(lang, "signInTitle")}</div>
            <div className="mt-1 text-sm text-muted">{t(lang, "signInBody")}</div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <Button variant="ghost" onClick={() => setLoginOpen(false)}>
                {t(lang, "notNow")}
              </Button>
              <Button
                onClick={() => {
                  setLoginOpen(false);
                  signIn("google");
                }}
              >
                {t(lang, "continueGoogle")}
              </Button>
            </div>
          </Card>
        </div>
      ) : null}

      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <div className="text-sm font-medium">{t(lang, "controls")}</div>
            <div className="text-xs text-muted">{t(lang, "controlsHint")}</div>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-[hsl(var(--accent))]"></span>
                {t(lang, "liveDbFeed")}
              </span>
              <span className="opacity-60">•</span>
              <span>
                {t(lang, "lastLoaded")}: {last ? timeAgo(last) : "—"}
              </span>
              <span className="opacity-60">•</span>
              <span>
                AI discovery: {aiDiscoveryEnabled ? "ON" : "OFF"}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:items-end">
            <div className="flex items-center gap-2">
              <Segmented
                value={kind}
                onChange={(v) => setKind(v)}
                options={[
                  { value: "feed" as const, label: "Feed" },
                  { value: "discovery" as const, label: "Discover" },
                ]}
              />

              <Segmented
                value={days}
                onChange={(v) => setDays(v)}
                options={[
                  ...(section === "history"
                    ? [
                        { value: 7 as const, label: t(lang, "sevenDays") },
                        { value: 30 as const, label: t(lang, "thirtyDays") },
                      ]
                    : [
                        { value: 1 as const, label: t(lang, "oneDay") },
                        { value: 7 as const, label: t(lang, "sevenDays") },
                      ]),
                ]}
              />

              <Button
                variant="ghost"
                className="gap-2"
                disabled={!aiSummaryEnabled}
                onClick={async () => {
                  if (!requireLogin()) return;
                  const next = !digestOpen;
                  setDigestOpen(next);
                  if (next) await ensureDigest();
                }}
                title={!aiSummaryEnabled ? "AI summary disabled" : undefined}
              >
                <Sparkles size={16} className="text-[hsl(var(--accent))]" />
                {t(lang, "aiSummary")}
              </Button>

            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder={t(lang, "countryPlaceholder")}
                className="w-full rounded-xl border border-soft bg-black/10 px-3 py-2 text-sm text-[hsl(var(--fg))] placeholder:text-muted focus-ring sm:w-44"
              />
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder={t(lang, "categoryPlaceholder")}
                className="w-full rounded-xl border border-soft bg-black/10 px-3 py-2 text-sm text-[hsl(var(--fg))] placeholder:text-muted focus-ring sm:w-52"
              />
            </div>

            {msg ? <div className="text-xs text-muted">{msg}</div> : null}
          </div>
        </div>
      </Card>

      {digestOpen ? (
        <Card className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium">{t(lang, "digestTitle")}</div>
              <div className="text-xs text-muted">{t(lang, "digestHint")}</div>
            </div>
            {digest ? (
              <SpeakButton
                text={digestSpeakText}
                lang={speechLang}
                labelSpeak={t(lang, "speak")}
                labelStop={t(lang, "stop")}
              />
            ) : null}
          </div>

          <div className="mt-3 rounded-2xl border border-soft bg-black/20 p-4">
            {digestLoading ? (
              <div className="text-sm text-muted">{t(lang, "generating")}</div>
            ) : digestError ? (
              <div className="text-sm text-muted">{digestError}</div>
            ) : digest ? (
              <div className="space-y-4">
                <div className="text-sm">{digest.overview}</div>

                <div>
                  <div className="mb-2 text-xs font-semibold text-muted">{t(lang, "themes")}</div>
                  <ul className="list-disc space-y-1 pl-5 text-sm">
                    {digest.themes.map((x, idx) => (
                      <li key={idx}>{x}</li>
                    ))}
                  </ul>
                </div>

                <div>
                  <div className="mb-2 text-xs font-semibold text-muted">{t(lang, "highlights")}</div>
                  <ul className="list-disc space-y-1 pl-5 text-sm">
                    {digest.highlights.map((x, idx) => (
                      <li key={idx}>{x}</li>
                    ))}
                  </ul>
                </div>

                <div>
                  <div className="mb-2 text-xs font-semibold text-muted">{t(lang, "whyItMattersLabel")}</div>
                  <ul className="list-disc space-y-1 pl-5 text-sm">
                    {digest.whyItMatters.map((x, idx) => (
                      <li key={idx}>{x}</li>
                    ))}
                  </ul>
                </div>

                <div>
                  <div className="mb-2 text-xs font-semibold text-muted">{t(lang, "watchlist")}</div>
                  <ul className="list-disc space-y-1 pl-5 text-sm">
                    {digest.watchlist.map((x, idx) => (
                      <li key={idx}>{x}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}

      <div className="space-y-3">
        {items.map((it) => {
          const open = Boolean(aiOpen[it.id]);
          const itemSpeakText = it.aiSummary || "";
          return (
            <Card key={it.id} className="p-4">
              <div className="min-w-0">
                <div className="text-xs text-muted">
                  {it.sourceName} • collected {timeAgo(it.createdAt)} • score {it.score.toFixed(2)}
                </div>
                <div className="mt-1 text-lg font-semibold leading-snug">{it.title}</div>
                <div className="mt-2 text-sm text-muted">{it.summary}</div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {it.country ? <Pill>{it.country}</Pill> : null}
                  {it.topics.slice(0, 6).map((x) => (
                    <Pill key={x}>{x}</Pill>
                  ))}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                  <A href={it.url}>{t(lang, "openSource")}</A>

                  <Button
                    variant="ghost"
                    className="gap-2"
                    disabled={!aiSummaryEnabled}
                    onClick={async () => {
                      if (!requireLogin()) return;
                      setAiOpen((x) => ({ ...x, [it.id]: !x[it.id] }));
                      if (!it.aiSummary) await ensureAiSummary(it.id);
                    }}
                  >
                    <Sparkles size={16} className="text-[hsl(var(--accent))]" />
                    {t(lang, "itemSummary")}
                  </Button>
                </div>

                {open ? (
                  <div className="mt-3 rounded-2xl border border-soft bg-black/10 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-medium text-muted">{t(lang, "itemSummary")}</div>
                      {it.aiSummary ? (
                        <SpeakButton
                          text={itemSpeakText}
                          lang={speechLang}
                          labelSpeak={t(lang, "speak")}
                          labelStop={t(lang, "stop")}
                        />
                      ) : null}
                    </div>
                    <div className="mt-1 text-sm">
                      {aiLoading[it.id] ? t(lang, "generating") : it.aiSummary || ""}
                    </div>
                  </div>
                ) : null}
              </div>
            </Card>
          );
        })}

        {items.length === 0 ? <div className="text-sm text-muted">{t(lang, "noItems")}</div> : null}
      </div>
    </div>
  );
}
