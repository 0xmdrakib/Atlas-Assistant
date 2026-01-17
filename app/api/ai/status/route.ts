export async function GET() {
  const summaryEnabled =
    String(process.env.AI_SUMMARY_ENABLED || "false").toLowerCase() === "true" &&
    Boolean(process.env.AI_SUMMARY_API_KEY);

  // Discovery can run in heuristic mode (no AI key) or AI-pick mode (with key).
  const discoveryEnabled = String(process.env.AI_DISCOVERY_ENABLED || "false").toLowerCase() === "true";
  const discoveryAiPickEnabled = Boolean(process.env.AI_DISCOVERY_API_KEY);

  return Response.json({ summaryEnabled, discoveryEnabled, discoveryAiPickEnabled });
}
