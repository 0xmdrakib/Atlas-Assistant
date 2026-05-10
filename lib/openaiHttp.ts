function openaiResponsesUrl(): string {
  const base = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  return `${base}/responses`;
}

export const OPENAI_MODELS = {
  summary: "gpt-4o-mini",
  digest: "gpt-4o-mini",
  translate: "gpt-4.1-mini",
  feedPicker: "gpt-4.1-mini",
} as const;

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || (status >= 500 && status <= 599);
}

export function isOpenAiEnabled(): boolean {
  const enabled = String(process.env.AI_ENABLED || "true").toLowerCase() !== "false";
  return enabled && Boolean(process.env.OPENAI_API_KEY);
}

function extractResponseText(data: any): string {
  if (typeof data?.output_text === "string") return data.output_text.trim();

  const chunks: string[] = [];
  for (const item of data?.output || []) {
    for (const c of item?.content || []) {
      if (typeof c?.text === "string") chunks.push(c.text);
      if (typeof c?.output_text === "string") chunks.push(c.output_text);
    }
  }
  return chunks.join("").trim();
}

export async function openaiGenerateText(args: {
  model: string;
  prompt: string;
  instructions?: string;
  temperature?: number;
  maxOutputTokens?: number;
  jsonSchema?: { name: string; schema: unknown; strict?: boolean };
  timeoutMs?: number;
  retries?: number;
}): Promise<string> {
  const {
    model,
    prompt,
    instructions,
    temperature = 0.2,
    maxOutputTokens = 800,
    jsonSchema,
    timeoutMs = 25_000,
    retries = 1,
  } = args;

  const apiKey = requiredEnv("OPENAI_API_KEY");
  let lastErr: any = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const body: any = {
        model,
        input: prompt,
        temperature,
        max_output_tokens: maxOutputTokens,
      };
      if (instructions) body.instructions = instructions;
      if (jsonSchema) {
        body.text = {
          format: {
            type: "json_schema",
            name: jsonSchema.name,
            schema: jsonSchema.schema,
            strict: jsonSchema.strict ?? true,
          },
        };
      }

      const res = await fetch(openaiResponsesUrl(), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        const err = new Error(`OpenAI response failed: ${res.status} ${txt}`);
        (err as any).status = res.status;
        lastErr = err;

        if (attempt < retries && isRetryableStatus(res.status)) {
          const backoff = Math.min(1500 * Math.pow(2, attempt), 8000);
          await sleep(backoff + Math.floor(Math.random() * 250));
          continue;
        }
        throw err;
      }

      const data = await res.json();
      const text = extractResponseText(data);
      if (!text) throw new Error("OpenAI returned no text");
      return text;
    } catch (e: any) {
      lastErr = e;
      const retryable = e?.name === "AbortError" || e?.code === "ECONNRESET";
      if (attempt < retries && retryable) {
        const backoff = Math.min(1500 * Math.pow(2, attempt), 8000);
        await sleep(backoff + Math.floor(Math.random() * 250));
        continue;
      }
      throw e;
    } finally {
      clearTimeout(t);
    }
  }

  throw lastErr || new Error("OpenAI request failed");
}
