import type { Section } from "@/lib/types";

export type SectionPolicy = {
  // How many candidates we consider from a single RSS feed per ingest run.
  perRunCap: number;

  // Product caps (hard limits for what we keep per time window).
  dailyCap: number;
  weeklyCap: number;
  monthlyCap: number;

  // Retention in DB (rolling, based on createdAt / collection time).
  retentionDays: number;

  // Scoring parameters
  recencyHalfLifeHours: number;
  minTrustScore: number;
  keywordBoosts: Array<{ keyword: string; boost: number }>;
};

const DEFAULTS = {
  // Product rule for feed: hourly ingest, max 1 item per section per run.
  // => 24/day, 168/week (and DB retention is 7 days).
  dailyCap: 24,
  weeklyCap: 168,
};

export const SECTION_POLICIES: Record<Section, SectionPolicy> = {
  global: {
    perRunCap: 2,
    dailyCap: DEFAULTS.dailyCap,
    weeklyCap: DEFAULTS.weeklyCap,
    monthlyCap: DEFAULTS.weeklyCap,
    retentionDays: 7,
    recencyHalfLifeHours: 12,
    minTrustScore: 60,
    keywordBoosts: [
      { keyword: "election", boost: 0.08 },
      { keyword: "ceasefire", boost: 0.08 },
      { keyword: "sanctions", boost: 0.06 },
      { keyword: "quake", boost: 0.06 },
      { keyword: "inflation", boost: 0.06 },
    ],
  },
  tech: {
    perRunCap: 2,
    dailyCap: DEFAULTS.dailyCap,
    weeklyCap: DEFAULTS.weeklyCap,
    monthlyCap: DEFAULTS.weeklyCap,
    retentionDays: 7,
    recencyHalfLifeHours: 16,
    minTrustScore: 60,
    keywordBoosts: [
      { keyword: "ai", boost: 0.08 },
      { keyword: "security", boost: 0.06 },
      { keyword: "breach", boost: 0.06 },
      { keyword: "chip", boost: 0.06 },
      { keyword: "open-source", boost: 0.06 },
    ],
  },
  innovators: {
    perRunCap: 2,
    dailyCap: DEFAULTS.dailyCap,
    weeklyCap: DEFAULTS.weeklyCap,
    monthlyCap: DEFAULTS.weeklyCap,
    retentionDays: 7,
    recencyHalfLifeHours: 36,
    minTrustScore: 60,
    keywordBoosts: [
      { keyword: "robot", boost: 0.08 },
      { keyword: "aerospace", boost: 0.08 },
      { keyword: "prototype", boost: 0.06 },
      { keyword: "funding", boost: 0.06 },
      { keyword: "lab", boost: 0.04 },
    ],
  },
  early: {
    perRunCap: 3,
    dailyCap: DEFAULTS.dailyCap,
    weeklyCap: DEFAULTS.weeklyCap,
    monthlyCap: DEFAULTS.weeklyCap,
    retentionDays: 7,
    recencyHalfLifeHours: 18,
    minTrustScore: 60,
    keywordBoosts: [
      { keyword: "patent", boost: 0.10 },
      { keyword: "arxiv", boost: 0.08 },
      { keyword: "preprint", boost: 0.08 },
      { keyword: "filing", boost: 0.06 },
      { keyword: "paper", boost: 0.04 },
    ],
  },
  creators: {
    perRunCap: 3,
    dailyCap: DEFAULTS.dailyCap,
    weeklyCap: DEFAULTS.weeklyCap,
    monthlyCap: DEFAULTS.weeklyCap,
    retentionDays: 7,
    recencyHalfLifeHours: 96,
    minTrustScore: 55,
    keywordBoosts: [
      { keyword: "course", boost: 0.08 },
      { keyword: "tutorial", boost: 0.06 },
      { keyword: "community", boost: 0.06 },
      { keyword: "guide", boost: 0.04 },
    ],
  },
  universe: {
    perRunCap: 2,
    dailyCap: DEFAULTS.dailyCap,
    weeklyCap: DEFAULTS.weeklyCap,
    monthlyCap: DEFAULTS.weeklyCap,
    retentionDays: 7,
    recencyHalfLifeHours: 48,
    minTrustScore: 60,
    keywordBoosts: [
      { keyword: "webb", boost: 0.10 },
      { keyword: "exoplanet", boost: 0.08 },
      { keyword: "telescope", boost: 0.06 },
      { keyword: "mars", boost: 0.06 },
      { keyword: "nasa", boost: 0.04 },
    ],
  },
  history: {
    perRunCap: 2,
    dailyCap: DEFAULTS.dailyCap,
    weeklyCap: DEFAULTS.weeklyCap,
    monthlyCap: DEFAULTS.weeklyCap,
    retentionDays: 7,
    recencyHalfLifeHours: 240,
    minTrustScore: 55,
    keywordBoosts: [
      { keyword: "caliphate", boost: 0.06 },
      { keyword: "andalus", boost: 0.06 },
      { keyword: "ottoman", boost: 0.06 },
      { keyword: "trade", boost: 0.04 },
      { keyword: "dynasty", boost: 0.04 },
    ],
  },
  faith: {
    perRunCap: 2,
    dailyCap: DEFAULTS.dailyCap,
    weeklyCap: DEFAULTS.weeklyCap,
    monthlyCap: DEFAULTS.weeklyCap,
    retentionDays: 7,
    recencyHalfLifeHours: 72,
    minTrustScore: 55,
    keywordBoosts: [
      { keyword: "quran", boost: 0.08 },
      { keyword: "hadith", boost: 0.06 },
      { keyword: "sunnah", boost: 0.06 },
      { keyword: "fiqh", boost: 0.06 },
      { keyword: "dua", boost: 0.04 },
    ],
  },
};
