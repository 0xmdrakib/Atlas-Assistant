import type { Section } from "@/lib/types";

export type SectionKeywordSet = {
  include: string[];
  exclude: string[];
  description: string;
};

export const SECTION_KEYWORDS: Record<Section, SectionKeywordSet> = {
  global: {
    include: [
      "election", "diplomacy", "sanctions", "summit", "treaty", "war", "strike",
      "missile", "ceasefire", "hostage", "invasion", "conflict", "peace",
      "inflation", "rates", "gdp", "recession", "debt", "budget", "economy",
      "stocks", "bond", "oil price", "currency", "trade",
      "climate", "flood", "storm", "hurricane", "wildfire", "earthquake",
      "health", "outbreak", "pandemic", "vaccine", "disease",
      "court", "ruling", "supreme court", "legislation", "policy",
      "united nations", "nato", "eu", "g7", "g20",
      "refugee", "immigration", "border", "protest",
      "nuclear", "military", "defense", "army", "navy",
      "president", "prime minister", "leader", "government",
      "tsunami", "disaster", "crisis", "emergency",
      "corruption", "scandal", "resign",
      "infrastructure", "reform", "coup",
    ],
    exclude: [
      "celebrity", "gossip", "movie review", "recipe", "fashion week",
      "dating", "lottery", "horoscope", "astrology",
      "tutorial", "how to cook", "workout routine",
      "game review", "music album",
    ],
    description:
      "World news covering geopolitics, armed conflicts, elections, global economy, climate disasters, health emergencies, major court rulings, and significant policy changes. Focus on events that affect nations and populations at scale.",
  },
  tech: {
    include: [
      "ai", "llm", "gpt", "claude", "gemini", "openai", "anthropic", "deepseek",
      "model", "machine learning", "neural", "transformer", "agent",
      "cybersecurity", "breach", "ransomware", "vulnerability", "cve", "phishing", "hack",
      "cloud", "kubernetes", "docker", "aws", "azure", "gcp", "serverless",
      "chip", "semiconductor", "gpu", "nvidia", "amd", "arm", "processor", "tsmc",
      "github", "git", "compiler", "sdk", "api", "framework", "open-source",
      "startup", "funding", "seed round", "series a", "series b", "venture", "yc",
      "ransomware", "malware", "zero-day", "encryption",
      "blockchain", "crypto", "bitcoin", "ethereum", "defi",
      "regulation", "antitrust", "privacy", "gdpr", "data protection",
      "self-driving", "ev", "battery", "autonomous",
      "robot", "drone", "iot", "sensors",
      "programming", "developer", "software", "algorithm",
    ],
    exclude: [
      "celebrity", "sports", "fashion", "recipe", "dating",
      "astrology", "horoscope", "lottery",
      "movie", "music album", "tv show", "gossip",
    ],
    description:
      "Technology: AI/ML breakthroughs, cybersecurity incidents, cloud computing, hardware/semiconductors, developer tools, tech startups, software engineering, data privacy, and emerging tech regulation. Exclude lifestyle, entertainment, sports.",
  },
  innovators: {
    include: [
      "robot", "robotics", "autonomous", "drone", "bipedal", "humanoid",
      "rocket", "spacex", "spacecraft", "satellite", "launch", "orbit",
      "biotech", "gene", "crispr", "clinical trial", "drug", "pharma",
      "manufacturing", "factory", "supply chain", "automation", "3d printing",
      "carbon capture", "battery", "solar", "wind", "hydrogen", "nuclear fusion",
      "prototype", "patent", "innovation", "breakthrough",
      "venture capital", "funding", "seed", "ipo",
      "electric vehicle", "ev battery", "solid state",
      "quantum computing", "quantum",
      "startup", "founder", "entrepreneur",
      "lab", "research", "discovery",
    ],
    exclude: [
      "celebrity", "gossip", "recipe", "fashion", "dating",
      "horoscope", "lottery", "movie review", "music",
      "sports score", "game", "tv show",
    ],
    description:
      "Innovation: robotics, aerospace, biotech, clean energy, quantum computing, advanced manufacturing, startups with breakthrough potential. Focus on people and organizations building the future. Exclude entertainment, lifestyle.",
  },
  early: {
    include: [
      "patent", "filing", "application", "invention",
      "arxiv", "preprint", "biorxiv", "medrxiv",
      "paper", "study", "dataset", "benchmark", "peer-reviewed",
      "standard", "draft", "rfc", "spec", "w3c", "ietf",
      "emerging", "experimental", "proof of concept", "poc",
      "breakthrough", "discovery", "first time",
      "quantum", "nano", "metamaterial",
      "gene therapy", "mrna", "vaccine candidate",
      "fusion", "reactor", "superconductor",
      "regulation draft", "legislation proposal",
    ],
    exclude: [
      "celebrity", "gossip", "recipe", "fashion", "sports",
      "dating", "horoscope", "lottery", "movie", "tv",
    ],
    description:
      "Early signals: patents, preprints, research papers, emerging standards, experimental breakthroughs, and technologies still in development. Focus on what's coming next, not what's already mainstream.",
  },
  creators: {
    include: [
      "open source", "oss", "repository", "license", "github",
      "tutorial", "guide", "how to", "course", "workshop", "walkthrough",
      "design", "ux", "ui", "typography", "figma", "responsive",
      "essay", "newsletter", "blog", "writing", "publication",
      "youtube", "video", "podcast", "channel", "streaming",
      "community", "forum", "discord", "slack",
      "library", "framework", "release", "changelog", "version",
      "creative", "art", "illustration", "animation",
      "side project", "indie", "maker",
      "accessibility", "a11y", "web standard",
    ],
    exclude: [
      "war", "missile", "conflict", "sanctions", "coup",
      "stock market crash", "recession",
      "celebrity gossip", "horoscope", "lottery",
    ],
    description:
      "Creators: open-source projects, tutorials, design systems, developer tools, community projects, writing, and creative work. Focus on content that helps people learn and build. Exclude politics, war, financial markets.",
  },
  universe: {
    include: [
      "nasa", "esa", "jaxa", "isro", "spaceX", "rocket lab",
      "telescope", "jwst", "hubble", "webb", "chandra",
      "exoplanet", "galaxy", "nebula", "star", "black hole", "supernova",
      "mars", "moon", "venus", "jupiter", "saturn", "asteroid", "comet",
      "orbit", "launch", "mission", "spacewalk",
      "physics", "quantum", "relativity", "particle", "higgs", "cern",
      "earth science", "ocean", "atmosphere", "geology", "volcano",
      "dark matter", "dark energy", "cosmology", "big bang",
      "space station", "iss", "artemis",
    ],
    exclude: [
      "celebrity", "gossip", "recipe", "fashion", "dating",
      "horoscope", "astrology", "lottery",
      "sports", "movie", "tv show", "music album",
    ],
    description:
      "Space & physics: space missions, telescopes, exoplanets, astrophysics, particle physics, earth science, and cosmology. Genuine scientific discoveries and missions only. Exclude astrology, horoscopes, entertainment.",
  },
  history: {
    include: [
      "caliphate", "andalus", "abbasid", "umayyad", "ottoman", "mamluk",
      "empire", "dynasty", "sultan", "kingdom", "civilization",
      "archaeology", "excavation", "artifact", "ruins", "discovery",
      "trade", "silk road", "caravan", "maritime", "merchant",
      "islamic history", "golden age", "scholar", "mosque",
      "ancient", "medieval", "renaissance", "colonial",
      "preservation", "restoration", "heritage", "museum",
      "battle", "conquest", "treaty", "alliance",
      "manuscript", "scroll", "papyrus", "inscription",
    ],
    exclude: [
      "celebrity", "gossip", "recipe", "fashion", "dating",
      "horoscope", "lottery", "movie review", "tv show",
      "sports score", "stock market",
    ],
    description:
      "History: Islamic history, ancient empires, archaeological discoveries, historical trade routes, preserved manuscripts, and heritage sites. Focus on events and discoveries from the past that deepen understanding of civilizations.",
  },
  faith: {
    include: [
      "quran", "surah", "ayat", "ayah", "tafsir", "tajweed",
      "hadith", "sahih", "bukhari", "muslim", "sunan", "riyad",
      "fiqh", "fatwa", "madhhab", "sharia", "halal", "haram",
      "spiritual", "tazkiyah", "dua", "dhikr", "ibadah",
      "ethic", "akhlaq", "character", "morality",
      "ramadan", "hajj", "umrah", "eid", "fasting", "prayer",
      "mosque", "imam", "scholar", "islamic",
      "charity", "zakat", "sadaqah",
      "monotheism", "tawheed", "belief",
    ],
    exclude: [
      "celebrity", "gossip", "recipe", "fashion", "dating",
      "horoscope", "astrology", "lottery",
      "sports", "movie", "tv show", "music album",
      "war", "missile", "conflict", "politics",
    ],
    description:
      "Faith: Quran, hadith, fiqh, spirituality, ethics, Islamic practice, and scholarship. Focus on religious knowledge, spiritual growth, and moral guidance. Exclude politics, entertainment, and celebrity news.",
  },
};

export function getSectionDescription(section: Section): string {
  return SECTION_KEYWORDS[section]?.description ?? "General news.";
}

export function computeRelevanceScore(section: Section, title: string, snippet: string): number {
  const rules = SECTION_KEYWORDS[section];
  if (!rules) return 0.5;

  const text = `${title} ${snippet}`.toLowerCase();
  let score = 0;

  for (const kw of rules.include) {
    if (text.includes(kw.toLowerCase())) score += 0.12;
  }

  for (const kw of rules.exclude) {
    if (text.includes(kw.toLowerCase())) score -= 0.25;
  }

  return Math.max(0, Math.min(1, score));
}