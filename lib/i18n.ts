export type LangCode =
  | "en"
  | "bn"
  | "ar"
  | "hi"
  | "ur"
  | "tr"
  | "id"
  | "fr"
  | "es"
  | "de"
  | "pt"
  | "it"
  | "ru"
  | "ja"
  | "ko";

export const LANGUAGES: Array<{ code: LangCode; label: string; nativeLabel: string; speechLang: string }> = [
  { code: "en", label: "English", nativeLabel: "English", speechLang: "en-US" },
  { code: "bn", label: "Bangla", nativeLabel: "বাংলা", speechLang: "bn-BD" },
  { code: "ar", label: "Arabic", nativeLabel: "العربية", speechLang: "ar" },
  { code: "hi", label: "Hindi", nativeLabel: "हिन्दी", speechLang: "hi-IN" },
  { code: "ur", label: "Urdu", nativeLabel: "اردو", speechLang: "ur" },
  { code: "tr", label: "Turkish", nativeLabel: "Türkçe", speechLang: "tr-TR" },
  { code: "id", label: "Indonesian", nativeLabel: "Bahasa Indonesia", speechLang: "id-ID" },
  { code: "fr", label: "French", nativeLabel: "Français", speechLang: "fr-FR" },
  { code: "es", label: "Spanish", nativeLabel: "Español", speechLang: "es-ES" },
  { code: "de", label: "German", nativeLabel: "Deutsch", speechLang: "de-DE" },
  { code: "pt", label: "Portuguese", nativeLabel: "Português", speechLang: "pt-BR" },
  { code: "it", label: "Italian", nativeLabel: "Italiano", speechLang: "it-IT" },
  { code: "ru", label: "Russian", nativeLabel: "Русский", speechLang: "ru-RU" },
  { code: "ja", label: "Japanese", nativeLabel: "日本語", speechLang: "ja-JP" },
  { code: "ko", label: "Korean", nativeLabel: "한국어", speechLang: "ko-KR" },
];

type Dict = Record<string, Record<string, string>>;

// Minimal UI dictionary (Bangla fully supported; others fall back to English).
const DICT: Dict = {
  en: {
    atlasAssistant: "Atlas Assistant",
    tagline: "A news portal all in one, and AI summery.",
    controls: "Controls",
    controlsHint: "Country + category + window • curated by scoring + caps • updates every 30 min",
    liveDbFeed: "Live DB feed",
    lastLoaded: "Last loaded",
    refresh: "Refresh",
    ingestNow: "Ingest now",
    ingesting: "Ingesting...",
    countryPlaceholder: "Country (e.g., US, BD)",
    categoryPlaceholder: "Category (e.g., robotics)",
    oneDay: "1 day",
    sevenDays: "7 days",
    thirtyDays: "30 days",
    aiSummary: "AI summary",
    itemSummary: "Item summary",
    signInTitle: "Sign in to use AI",
    signInBody: "Google login protects AI usage and enables per-user limits.",
    notNow: "Not now",
    continueGoogle: "Continue with Google",
    noItems: "No items match those filters (or ingest has not run yet).",
    openSource: "Open source",
    digestTitle: "AI Digest",
    digestHint: "Summarizes what’s on this page (window + filters)",
    generating: "Generating…",
    settings: "Settings",
    language: "Language",
    theme: "Theme",
    dark: "Dark",
    light: "Light",
    translateNeedsLogin: "Sign in to translate the feed.",
    translateNeedsKey: "Add AI key to translate the feed.",

    themes: "Themes",
    highlights: "Highlights",
    whyItMattersLabel: "Why it matters",
    watchlist: "Watchlist",
    speak: "Speak",
    stop: "Stop",

    tabGlobal: "Global news",
    tabTech: "Tech news",
    tabInnovators: "Innovators",
    tabEarly: "Early signals",
    tabCreators: "Great creators",
    tabUniverse: "Universe",
    tabHistory: "History",
    tabFaith: "Faith",
  },
  bn: {
    atlasAssistant: "অ্যাটলাস অ্যাসিস্ট্যান্ট",
    tagline: "সিগন্যাল-ফার্স্ট স্ট্রিম • মিনিমাল, ফাস্ট, শান্ত।",
    controls: "কন্ট্রোল",
    controlsHint: "Country + category + window • স্কোরিং + ক্যাপস দিয়ে কিউরেটেড • প্রতি ৩০ মিনিটে আপডেট",
    liveDbFeed: "লাইভ ডিবি ফিড",
    lastLoaded: "শেষ লোড",
    refresh: "রিফ্রেশ",
    ingestNow: "ইনজেস্ট",
    ingesting: "ইনজেস্ট হচ্ছে...",
    countryPlaceholder: "কান্ট্রি (যেমন: US, BD)",
    categoryPlaceholder: "ক্যাটাগরি (যেমন: robotics)",
    oneDay: "১ দিন",
    sevenDays: "৭ দিন",
    thirtyDays: "৩০ দিন",
    aiSummary: "এআই সামারি",
    itemSummary: "আইটেম সামারি",
    signInTitle: "এআই ব্যবহার করতে লগইন করুন",
    signInBody: "Google login এআই ব্যবহার সুরক্ষিত রাখে এবং per-user limit সক্রিয় করে।",
    notNow: "এখন না",
    continueGoogle: "Google দিয়ে চালিয়ে যান",
    noItems: "এই ফিল্টারে কোনো আইটেম নেই (অথবা ingest এখনো রান হয়নি)।",
    openSource: "সোর্স খুলুন",
    digestTitle: "এআই ডাইজেস্ট",
    digestHint: "এই পেজের সব নিউজ (window + filters) এক ক্লিকে সামারি",
    generating: "তৈরি হচ্ছে…",
    settings: "সেটিংস",
    language: "ল্যাঙ্গুয়েজ",
    theme: "থিম",
    dark: "ডার্ক",
    light: "লাইট",
    translateNeedsLogin: "ফিড ট্রান্সলেট করতে লগইন করুন।",
    translateNeedsKey: "ট্রান্সলেট করতে এআই কী যোগ করুন।",

    themes: "থিম",
    highlights: "হাইলাইটস",
    whyItMattersLabel: "কেন গুরুত্বপূর্ণ",
    watchlist: "ওয়াচলিস্ট",
    speak: "শুনুন",
    stop: "থামান",

    tabGlobal: "গ্লোবাল নিউজ",
    tabTech: "টেক নিউজ",
    tabInnovators: "ইনোভেটরস",
    tabEarly: "আর্লি সিগন্যালস",
    tabCreators: "গ্রেট ক্রিয়েটরস",
    tabUniverse: "মহাবিশ্ব",
    tabHistory: "ইতিহাস",
    tabFaith: "ঈমান",
  },
};

export function t(lang: string, key: keyof (typeof DICT)["en"]): string {
  const l = (lang || "en").toLowerCase();
  return DICT[l]?.[key] || DICT.en[key] || String(key);
}

export function getSpeechLang(code: string): string {
  const l = LANGUAGES.find((x) => x.code === code);
  return l?.speechLang || "en-US";
}
