const workletCode = `
class PCM16Processor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = new Float32Array(0);
    this._targetSamples = 2048; // ~128ms at 16kHz = 4096 bytes PCM16
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const float32 = input[0];
    const ratio = sampleRate / 16000;

    // Resample to 16kHz
    let resampled;
    if (Math.abs(ratio - 1) < 0.01) {
      resampled = float32;
    } else {
      const outLen = Math.floor(float32.length / ratio);
      resampled = new Float32Array(outLen);
      for (let i = 0; i < outLen; i++) {
        const src = i * ratio;
        const lo = Math.floor(src);
        const hi = Math.min(lo + 1, float32.length - 1);
        const frac = src - lo;
        resampled[i] = float32[lo] * (1 - frac) + float32[hi] * frac;
      }
    }

    // Accumulate into buffer
    const merged = new Float32Array(this._buffer.length + resampled.length);
    merged.set(this._buffer);
    merged.set(resampled, this._buffer.length);
    this._buffer = merged;

    // Flush when we have enough samples
    while (this._buffer.length >= this._targetSamples) {
      const chunk = this._buffer.slice(0, this._targetSamples);
      this._buffer = this._buffer.slice(this._targetSamples);

      const pcm16 = new Int16Array(chunk.length);
      for (let i = 0; i < chunk.length; i++) {
        const s = Math.max(-1, Math.min(1, chunk[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
    }

    return true;
  }
}
registerProcessor('pcm16-processor', PCM16Processor);
`;

const blob = new Blob([workletCode], { type: "application/javascript" });
const pcmWorkletUrl = URL.createObjectURL(blob);

export interface AudioCaptureConfig {
  deviceId?: string;
  onAudioChunk: (pcm16: ArrayBuffer) => void;
  onError: (error: string) => void;
}

export class AudioCapture {
  private audioContext: any = null;
  private mediaStream: any = null;
  private workletNode: any = null;
  private sourceNode: any = null;
  private config: AudioCaptureConfig | null = null;

  async start(config: AudioCaptureConfig): Promise<void> {
    this.config = config;
    const nav = globalThis.navigator as any;

    const constraints = {
      audio: {
        deviceId:
          config.deviceId && config.deviceId !== "default"
            ? { exact: config.deviceId }
            : undefined,
        sampleRate: { ideal: 16000 },
        channelCount: { exact: 1 },
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    };

    try {
      this.mediaStream = await nav.mediaDevices.getUserMedia(constraints);
    } catch (e: any) {
      config.onError(
        e instanceof Error ? e.message : "マイクへのアクセスに失敗しました",
      );
      return;
    }

    const AudioContextCtor =
      (globalThis as any).AudioContext ??
      (globalThis as any).webkitAudioContext;
    this.audioContext = new AudioContextCtor();
    await this.audioContext.audioWorklet.addModule(pcmWorkletUrl);

    this.sourceNode = this.audioContext.createMediaStreamSource(
      this.mediaStream,
    );
    const AudioWorkletNodeCtor = (globalThis as any).AudioWorkletNode;
    this.workletNode = new AudioWorkletNodeCtor(
      this.audioContext,
      "pcm16-processor",
    );

    this.workletNode.port.onmessage = (event: any) => {
      config.onAudioChunk(event.data as ArrayBuffer);
    };

    this.sourceNode.connect(this.workletNode);
  }

  stop(): void {
    this.workletNode?.disconnect();
    this.sourceNode?.disconnect();
    this.mediaStream?.getTracks().forEach((t: any) => t.stop());
    this.audioContext?.close();
    this.workletNode = null;
    this.sourceNode = null;
    this.mediaStream = null;
    this.audioContext = null;
  }

  async switchDevice(deviceId: string): Promise<void> {
    if (!this.config) return;
    this.stop();
    await this.start({ ...this.config, deviceId });
  }
}
