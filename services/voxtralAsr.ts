import {
  getApiMode,
  requireMistralApiKey,
  requireVpsBaseUrl,
} from "@/services/apiConfig";

async function consumeSseTranscription(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onInterim: (text: string) => void,
): Promise<string> {
  const decoder = new TextDecoder();
  let fullText = "";
  let sseBuffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    sseBuffer += decoder.decode(value, { stream: true });
    const lines = sseBuffer.split("\n");
    sseBuffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const jsonStr = line.slice(6).trim();
        if (jsonStr === "[DONE]") continue;
        try {
          const event = JSON.parse(jsonStr);
          if (event.type === "transcription.text.delta" && event.text) {
            fullText += event.text;
            onInterim(fullText);
          }
        } catch {
          // ignore parse errors
        }
      }
    }
  }

  return fullText;
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

  return new Blob([buffer], { type: "audio/wav" });
}

export async function transcribeStream(
  audioChunks: Int16Array[],
  onInterim: (text: string) => void,
  onFinal: (text: string) => void,
  onError: (error: string) => void,
  opts?: { model?: string; language?: string },
): Promise<void> {
  const wav = buildWavFromChunks(audioChunks);

  const formData = new FormData();
  formData.append("model", opts?.model ?? "voxtral-mini-2602");
  formData.append("file", wav, "audio.wav");
  formData.append("language", opts?.language ?? "ja");
  formData.append("stream", "true");

  try {
    const mode = getApiMode();
    const url =
      mode === "vps_proxy"
        ? `${requireVpsBaseUrl()}/vps/asr/transcribe`
        : "https://api.mistral.ai/v1/audio/transcriptions";

    const headers: Record<string, string> =
      mode === "direct_client"
        ? { Authorization: `Bearer ${requireMistralApiKey()}` }
        : {};

    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: formData as any,
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      onError(`Voxtral API ${resp.status}: ${errBody}`);
      return;
    }

    const reader = resp.body?.getReader();
    if (!reader) return;

    const fullText = await consumeSseTranscription(reader, onInterim);

    if (fullText.trim()) {
      onFinal(fullText.trim());
    }
  } catch (err: any) {
    onError(err.message ?? "Transcription failed");
  }
}

export async function transcribeFile(
  file: { uri: string; mimeType?: string; filename?: string },
  onInterim: (text: string) => void,
  onFinal: (text: string) => void,
  onError: (error: string) => void,
  opts?: { model?: string; language?: string },
): Promise<void> {
  const formData = new FormData();
  formData.append("model", opts?.model ?? "voxtral-mini-2602");
  formData.append("language", opts?.language ?? "ja");
  formData.append("stream", "true");
  formData.append("file", {
    uri: file.uri,
    type: file.mimeType ?? "audio/m4a",
    name: file.filename ?? "audio.m4a",
  } as any);

  try {
    const mode = getApiMode();
    const url =
      mode === "vps_proxy"
        ? `${requireVpsBaseUrl()}/vps/asr/transcribe`
        : "https://api.mistral.ai/v1/audio/transcriptions";

    const headers: Record<string, string> =
      mode === "direct_client"
        ? { Authorization: `Bearer ${requireMistralApiKey()}` }
        : {};

    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: formData as any,
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      onError(`Voxtral API ${resp.status}: ${errBody}`);
      return;
    }

    const reader = resp.body?.getReader();
    if (!reader) return;

    const fullText = await consumeSseTranscription(reader, onInterim);
    if (fullText.trim()) {
      onFinal(fullText.trim());
    }
  } catch (err: any) {
    onError(err.message ?? "Transcription failed");
  }
}
