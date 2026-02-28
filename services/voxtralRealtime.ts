import {
  getApiMode,
  requireMistralApiKey,
  requireVpsBaseUrl,
} from "@/services/apiConfig";

/**
 * Build a WAV file from PCM S16LE samples at 16kHz mono.
 */
function buildWav(pcm16Samples: Int16Array): Blob {
  const numChannels = 1;
  const sampleRate = 16000;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcm16Samples.length * (bitsPerSample / 8);
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");

  // fmt chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data chunk
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  const output = new Int16Array(buffer, 44);
  output.set(pcm16Samples);

  return new Blob([buffer], { type: "audio/wav" });
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

export interface VoxtralRealtimeConfig {
  apiKey?: string;
  model?: string;
  onInterimTranscript: (text: string) => void;
  onFinalTranscript: (text: string) => void;
  onError: (error: string) => void;
  onConnectionChange: (connected: boolean) => void;
}

/**
 * Buffers PCM16 audio chunks and periodically sends them to
 * Mistral's POST /v1/audio/transcriptions for transcription.
 * Uses the streaming SSE response for faster first-token delivery.
 */
export class VoxtralRealtimeClient {
  private config: VoxtralRealtimeConfig;
  private buffer: Int16Array[] = [];
  private bufferSamples = 0;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private active = false;
  private processing = false;
  // ~2 seconds of audio at 16kHz
  private flushThreshold = 32000;
  private flushIntervalMs = 2000;

  constructor(config: VoxtralRealtimeConfig) {
    this.config = config;
  }

  connect(): void {
    this.active = true;
    this.buffer = [];
    this.bufferSamples = 0;
    this.config.onConnectionChange(true);

    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.flushIntervalMs);
  }

  appendAudio(pcm16Chunk: ArrayBuffer): void {
    if (!this.active) return;
    const samples = new Int16Array(pcm16Chunk);
    this.buffer.push(samples);
    this.bufferSamples += samples.length;

    // Auto-flush when buffer is large enough
    if (this.bufferSamples >= this.flushThreshold && !this.processing) {
      this.flush();
    }
  }

  private async flush(): Promise<void> {
    if (this.bufferSamples === 0 || this.processing || !this.active) return;
    this.processing = true;

    // Grab current buffer
    const chunks = this.buffer;
    const totalSamples = this.bufferSamples;
    this.buffer = [];
    this.bufferSamples = 0;

    // Merge chunks into single Int16Array
    const merged = new Int16Array(totalSamples);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    // Check if audio is essentially silence (skip to avoid hallucination)
    // Use RMS energy to detect speech vs background noise
    let sumSq = 0;
    for (let i = 0; i < merged.length; i++) {
      sumSq += merged[i] * merged[i];
    }
    const rms = Math.sqrt(sumSq / merged.length);
    if (rms < 500) {
      // Too quiet (background noise / silence), skip
      this.processing = false;
      return;
    }

    const wav = buildWav(merged);
    const model = this.config.model ?? "voxtral-mini-2507";

    try {
      const formData = new FormData();
      formData.append("model", model);
      formData.append("file", wav, "audio.wav");
      formData.append("language", "ja");
      formData.append("stream", "true");

      const mode = getApiMode();
      const url =
        mode === "vps_proxy"
          ? `${requireVpsBaseUrl()}/vps/asr/transcribe`
          : "https://api.mistral.ai/v1/audio/transcriptions";

      const apiKey =
        this.config.apiKey ||
        (mode === "direct_client" ? requireMistralApiKey() : "");
      const headers: Record<string, string> =
        mode === "direct_client" ? { Authorization: `Bearer ${apiKey}` } : {};

      const resp = (await (globalThis as any).fetch(url, {
        method: "POST",
        headers,
        body: formData,
      })) as Response;

      if (!resp.ok) {
        const errBody = await resp.text();
        this.config.onError(`Voxtral API ${resp.status}: ${errBody}`);
        this.processing = false;
        return;
      }

      // Parse SSE stream
      const reader = resp.body?.getReader();
      if (!reader) {
        this.processing = false;
        return;
      }

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
                this.config.onInterimTranscript(fullText);
              }
            } catch {
              // ignore parse errors
            }
          }
        }
      }

      if (fullText.trim()) {
        this.config.onFinalTranscript(fullText.trim());
      }
    } catch (err: any) {
      this.config.onError(err.message ?? "Transcription request failed");
    }

    this.processing = false;
  }

  disconnect(): void {
    this.active = false;
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.buffer = [];
    this.bufferSamples = 0;
    this.config.onConnectionChange(false);
  }

  pause(): void {
    // Flush remaining audio
    this.flush();
  }

  resume(): void {
    // No-op; just resume sending audio chunks
  }
}
