export async function GET() {
  const summaryEnabled =
    String(process.env.AI_SUMMARY_ENABLED || "false").toLowerCase() === "true" &&
    Boolean(process.env.AI_SUMMARY_API_KEY);

  // "AI" tab is powered only by the 3 search providers below.
  // If none of these keys are set, AI results should be empty.
  const providers = {
    x: Boolean(process.env.X_BEARER_TOKEN),
    youtube: Boolean(process.env.YOUTUBE_API_KEY),
    github: Boolean(process.env.GITHUB_TOKEN),
  };

  const aiSearchEnabled = providers.x || providers.youtube || providers.github;

  return Response.json({ summaryEnabled, aiSearchEnabled, providers });
}
