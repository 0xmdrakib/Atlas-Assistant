/**
 * Gemini HTTP transport with optional Vertex AI routing.
 *
 * - Default (no flags): Gemini Developer API (AI Studio key)
 * - If GOOGLE_GENAI_USE_VERTEXAI=true: Gemini API on Vertex AI (Google Cloud API key)
 *
 * Vertex AI requires GOOGLE_CLOUD_PROJECT (and optionally GOOGLE_CLOUD_LOCATION; default: global).
 */

export function isVertexEnabled(): boolean {
  return String(process.env.GOOGLE_GENAI_USE_VERTEXAI || "").toLowerCase() === "true";
}

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function getVertexProject(): string {
  return (
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT_ID ||
    process.env.GCP_PROJECT ||
    process.env.VERTEX_PROJECT_ID ||
    ""
  );
}

function getVertexLocation(): string {
  // "global" enables the global endpoint for better availability (when supported by the chosen model).
  return (
    process.env.GOOGLE_CLOUD_LOCATION ||
    process.env.VERTEX_LOCATION ||
    process.env.GOOGLE_CLOUD_REGION ||
    "global"
  );
}

export function buildGenerateContentUrl(model: string, apiKey: string): string {
  const key = encodeURIComponent(apiKey);
  if (!isVertexEnabled()) {
    return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  }

  const project = getVertexProject();
  if (!project) {
    throw new Error(
      "Vertex AI is enabled (GOOGLE_GENAI_USE_VERTEXAI=true) but GOOGLE_CLOUD_PROJECT is missing."
    );
  }
  const location = getVertexLocation();
  return `https://aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent?key=${key}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

export async function postJsonWithRetry(args: {
  url: string;
  body: any;
  timeoutMs?: number;
  retries?: number;
}): Promise<any> {
  const { url, body, timeoutMs = 20_000, retries = 1 } = args;
  let lastErr: any = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        const err = new Error(`Gemini generateContent failed: ${res.status} ${txt}`);
        (err as any).status = res.status;
        lastErr = err;

        if (attempt < retries && isRetryableStatus(res.status)) {
          const backoff = Math.min(1500 * Math.pow(2, attempt), 8000);
          await sleep(backoff + Math.floor(Math.random() * 250));
          continue;
        }
        throw err;
      }

      return await res.json();
    } catch (e: any) {
      lastErr = e;
      const isAbort = e?.name === "AbortError";
      if (attempt < retries && (isAbort || e?.code === "ECONNRESET")) {
        const backoff = Math.min(1500 * Math.pow(2, attempt), 8000);
        await sleep(backoff + Math.floor(Math.random() * 250));
        continue;
      }
      throw e;
    } finally {
      clearTimeout(t);
    }
  }

  // Should be unreachable.
  throw lastErr || new Error("Gemini request failed");
}

export async function generateText(args: {
  apiKey: string;
  model: string;
  prompt: string;
  systemInstruction?: string;
  temperature?: number;
  maxOutputTokens?: number;
  responseMimeType?: string;
  responseSchema?: unknown;
  responseJsonSchema?: unknown;
  timeoutMs?: number;
  retries?: number;
}): Promise<string> {
  const {
    apiKey,
    model,
    prompt,
    systemInstruction,
    temperature = 0.2,
    maxOutputTokens = 500,
    responseMimeType,
    responseSchema,
    responseJsonSchema,
    timeoutMs,
    retries,
  } = args;

  const url = buildGenerateContentUrl(model, apiKey);

  const generationConfig: any = {
    temperature,
    maxOutputTokens,
  };

  if (responseMimeType) generationConfig.responseMimeType = responseMimeType;

  // IMPORTANT:
  // - Vertex AI documents `responseSchema` (OpenAPI subset) + `responseJsonSchema` (protobuf Value).
  // - Gemini Developer API supports `responseSchema` too.
  // - This code maps JSON Schema -> responseSchema when Vertex is enabled, because responseSchema is
  //   the most consistently documented field on Vertex.
  if (responseSchema) generationConfig.responseSchema = responseSchema;
  else if (responseJsonSchema) {
    if (isVertexEnabled()) generationConfig.responseSchema = responseJsonSchema;
    else (generationConfig as any)._responseJsonSchema = responseJsonSchema;
  }

  const body: any = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig,
  };

  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  const data = await postJsonWithRetry({ url, body, timeoutMs, retries });
  const text =
    data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || "").join("") ||
    data?.candidates?.[0]?.output ||
    "";
  return String(text || "").trim();
}
