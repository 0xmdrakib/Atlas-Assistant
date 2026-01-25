export async function GET() {
  const summaryEnabled =
    String(process.env.AI_SUMMARY_ENABLED || "false").toLowerCase() === "true" &&
    Boolean(process.env.AI_SUMMARY_API_KEY);

  // "AI" tab is powered only by the 3 search providers below.
  // If none of these keys are set, AI results should be empty.
  const envKeys = Object.keys(process.env);
  const githubRss =
    Boolean(process.env.GITHUB_RSS_URLS || process.env.GITHUB_RSS_URL) ||
    envKeys.some((k) => k.startsWith("GITHUB_RSS_URLS_") || k.startsWith("GITHUB_RSS_URL_"));
  const xRss =
    Boolean(process.env.X_RSS_URLS || process.env.X_RSS_URL) ||
    envKeys.some((k) => k.startsWith("X_RSS_URLS_") || k.startsWith("X_RSS_URL_"));

  const providers = {
    x: xRss,
    youtube: Boolean(process.env.YOUTUBE_API_KEY),
    github: githubRss,
  };

  const aiSearchEnabled = providers.x || providers.youtube || providers.github;

  return Response.json({ summaryEnabled, aiSearchEnabled, providers });
}
