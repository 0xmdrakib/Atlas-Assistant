export type Section = "news" | "cosmos" | "innovators" | "signals" | "creators" | "history";
export type ContentItem = {
  id: string;
  section: Section;
  title: string;
  summary: string;
  aiSummary?: string;
  sourceName: string;
  url: string;
  country?: string;
  topics: string[];
  publishedAt: string;
  score: number;
};
