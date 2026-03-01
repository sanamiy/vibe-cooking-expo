import { requireMistralApiKey } from "@/services/apiConfig";
import { postJsonVps, shouldUseServerProxy } from "@/services/vpsClient";

const DEFAULT_MODEL = "voxtral-mini-2507";
const DEFAULT_PROMPT =
  "音声の内容を日本語で簡潔に文字起こししてください。補足説明はせず、発話テキストのみを返してください。";

interface VoxtralSpeechUnderstandingOptions {
  model?: string;
  prompt?: string;
  temperature?: number;
}

function buildWavFromChunks(audioChunks: Int16Array[]): Blob {
  const totalSamples = audioChunks.reduce((sum, c) => sum + c.length, 0);
  const merged = new Int16Array(totalSamples);
  let offset = 0;
  for (const chunk of audioChunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  const sampleRate = 16000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = merged.length * (bitsPerSample / 8);
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (off: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(off + i, str.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  const output = new Int16Array(buffer, 44);
  output.set(merged);

  return new Blob([buffer as any], { type: "audio/wav" } as any);
}

async function blobToBase64(blob: Blob): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read audio blob"));
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Unexpected FileReader result"));
        return;
      }
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}

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

function extractAssistantText(response: any): string {
  const content = response?.choices?.[0]?.message?.content;
  const text = collectText(content)
    .map((s) => s.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
  return text;
}

async function callMistralSpeechUnderstandingDirect(
  audioBase64: string,
  opts?: VoxtralSpeechUnderstandingOptions,
): Promise<string> {
  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${requireMistralApiKey()}`,
    },
    body: JSON.stringify({
      model: opts?.model ?? DEFAULT_MODEL,
      temperature: opts?.temperature ?? 0,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "input_audio",
              input_audio: audioBase64,
            },
            {
              type: "text",
              text: opts?.prompt ?? DEFAULT_PROMPT,
            },
          ],
        },
      ],
    }),
  });

  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`Voxtral API error ${res.status}: ${raw}`);
  }
  const data = JSON.parse(raw);
  const text = extractAssistantText(data);
  if (!text) throw new Error("Voxtral API returned empty text");
  return text;
}

export async function understandAudioWithVoxtral(
  audioChunks: Int16Array[],
  opts?: VoxtralSpeechUnderstandingOptions,
): Promise<string> {
  if (!audioChunks.length) {
    throw new Error("No audio chunks provided");
  }

  const wav = buildWavFromChunks(audioChunks);
  const audioBase64 = await blobToBase64(wav);

  if (shouldUseServerProxy()) {
    const data = await postJsonVps<{ text: string }>("/vps/audio/understand", {
      audioBase64,
      model: opts?.model ?? DEFAULT_MODEL,
      prompt: opts?.prompt ?? DEFAULT_PROMPT,
      temperature: opts?.temperature ?? 0,
    });
    const text = String(data.text ?? "").trim();
    if (!text) throw new Error("VPS Voxtral API returned empty text");
    return text;
  }

  return await callMistralSpeechUnderstandingDirect(audioBase64, opts);
}
