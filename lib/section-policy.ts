import type { Section } from "@/lib/types";

export type SectionPolicy = {
  perRunCap: number;
  dailyCap: number;
  weeklyCap: number;
  monthlyCap: number;
  retentionDays: number;
  recencyHalfLifeHours: number;
  minTrustScore: number;
  keywordBoosts: Array<{ keyword: string; boost: number }>;
};

export const SECTION_POLICIES: Record<Section, SectionPolicy> = {
  global: { perRunCap: 12, dailyCap: 120, weeklyCap: 600, monthlyCap: 2400, retentionDays: 7, recencyHalfLifeHours: 12, minTrustScore: 60,
    keywordBoosts: [{ keyword: "election", boost: 0.08 },{ keyword: "ceasefire", boost: 0.08 },{ keyword: "sanctions", boost: 0.06 },{ keyword: "quake", boost: 0.06 }] },
  tech: { perRunCap: 10, dailyCap: 90, weeklyCap: 450, monthlyCap: 1800, retentionDays: 7, recencyHalfLifeHours: 16, minTrustScore: 60,
    keywordBoosts: [{ keyword: "ai", boost: 0.08 },{ keyword: "security", boost: 0.06 },{ keyword: "chip", boost: 0.06 },{ keyword: "open-source", boost: 0.06 }] },
  innovators: { perRunCap: 8, dailyCap: 50, weeklyCap: 240, monthlyCap: 850, retentionDays: 7, recencyHalfLifeHours: 36, minTrustScore: 60,
    keywordBoosts: [{ keyword: "robot", boost: 0.08 },{ keyword: "aerospace", boost: 0.08 },{ keyword: "open-source", boost: 0.06 },{ keyword: "prototype", boost: 0.06 }] },
  early: { perRunCap: 8, dailyCap: 50, weeklyCap: 240, monthlyCap: 900, retentionDays: 7, recencyHalfLifeHours: 18, minTrustScore: 60,
    keywordBoosts: [{ keyword: "patent", boost: 0.10 },{ keyword: "arxiv", boost: 0.08 },{ keyword: "preprint", boost: 0.08 },{ keyword: "filing", boost: 0.06 }] },
  creators: { perRunCap: 6, dailyCap: 25, weeklyCap: 140, monthlyCap: 420, retentionDays: 7, recencyHalfLifeHours: 96, minTrustScore: 55,
    keywordBoosts: [{ keyword: "course", boost: 0.08 },{ keyword: "tutorial", boost: 0.06 },{ keyword: "ethics", boost: 0.06 },{ keyword: "community", boost: 0.06 }] },
  universe: { perRunCap: 8, dailyCap: 40, weeklyCap: 200, monthlyCap: 700, retentionDays: 7, recencyHalfLifeHours: 48, minTrustScore: 60,
    keywordBoosts: [{ keyword: "webb", boost: 0.10 },{ keyword: "exoplanet", boost: 0.08 },{ keyword: "telescope", boost: 0.06 },{ keyword: "mars", boost: 0.06 }] },
  history: { perRunCap: 4, dailyCap: 10, weeklyCap: 40, monthlyCap: 120, retentionDays: 30, recencyHalfLifeHours: 240, minTrustScore: 55,
    keywordBoosts: [{ keyword: "caliphate", boost: 0.06 },{ keyword: "andalus", boost: 0.06 },{ keyword: "ottoman", boost: 0.06 },{ keyword: "trade", boost: 0.04 }] },
  faith: { perRunCap: 4, dailyCap: 20, weeklyCap: 90, monthlyCap: 300, retentionDays: 7, recencyHalfLifeHours: 72, minTrustScore: 55,
    keywordBoosts: [{ keyword: "quran", boost: 0.08 },{ keyword: "hadith", boost: 0.06 },{ keyword: "sunnah", boost: 0.06 },{ keyword: "fiqh", boost: 0.06 }] },
};
