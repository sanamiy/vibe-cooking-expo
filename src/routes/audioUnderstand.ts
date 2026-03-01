import { jsonResponse } from "../lib/json";

function collectText(value: unknown): string[] {
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
}

function extractAssistantText(response: {
  choices?: Array<{ message?: { content?: unknown } }>;
}): string {
  const content = response?.choices?.[0]?.message?.content;
  return collectText(content)
    .map((s) => s.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

export async function handleAudioUnderstand(request: Request, env: Env): Promise<Response> {
  const { audioBase64, prompt, model, temperature } = (await request.json()) as {
    audioBase64?: string;
    prompt?: string;
    model?: string;
    temperature?: number;
  };

  if (!audioBase64 || typeof audioBase64 !== "string") {
    return jsonResponse(400, { error: "audioBase64 is required" });
  }

  const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.MISTRAL_API_KEY}`,
    },
    body: JSON.stringify({
      model: model || "voxtral-mini-2507",
      temperature: temperature ?? 0,
      messages: [
        {
          role: "user",
          content: [
            { type: "input_audio", input_audio: String(audioBase64) },
            {
              type: "text",
              text:
                prompt ||
                "音声の内容を日本語で簡潔に文字起こししてください。補足説明はせず、発話テキストのみを返してください。",
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Voxtral API error ${response.status}: ${text}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  const text = extractAssistantText(data);

  return jsonResponse(200, { text });
}
