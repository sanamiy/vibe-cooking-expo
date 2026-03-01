export async function callMistral(
  env: Env,
  messages: Array<{ role: string; content: string }>,
  opts?: { temperature?: number; responseFormat?: { type: string } },
): Promise<unknown> {
  const temperature = opts?.temperature ?? 0.7;

  const body: Record<string, unknown> = {
    model: "mistral-small-latest",
    messages,
    temperature,
  };

  if (opts?.responseFormat) {
    body.response_format = opts.responseFormat;
  }

  const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.MISTRAL_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Mistral API error ${response.status}: ${text}`);
  }

  return response.json();
}

interface MistralAudioChatOptions {
  audioBase64: string;
  prompt?: string;
  model?: string;
  temperature?: number;
}

export function extractAssistantText(response: unknown): string {
  const collectText = (value: unknown): string[] => {
    if (typeof value === "string") return [value];
    if (Array.isArray(value)) return value.flatMap((v) => collectText(v));
    if (!value || typeof value !== "object") return [];

    const record = value as Record<string, unknown>;
    const out: string[] = [];
    if (typeof record.text === "string") out.push(record.text);
    if (typeof record.content === "string" || Array.isArray(record.content)) {
      out.push(...collectText(record.content));
    }
    return out;
  };

  const record = response as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  const content = record.choices?.[0]?.message?.content;
  return collectText(content)
    .map((s) => s.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

export async function callMistralAudioChat(
  env: Env,
  opts: MistralAudioChatOptions,
): Promise<unknown> {
  const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.MISTRAL_API_KEY}`,
    },
    body: JSON.stringify({
      model: opts.model ?? "voxtral-mini-2507",
      temperature: opts.temperature ?? 0,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "input_audio",
              input_audio: opts.audioBase64,
            },
            {
              type: "text",
              text:
                opts.prompt ??
                "音声の内容を日本語で簡潔に文字起こししてください。補足説明はせず、発話テキストのみを返してください。",
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Mistral API error ${response.status}: ${text}`);
  }

  return response.json();
}
