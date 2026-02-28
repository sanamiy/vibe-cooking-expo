import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";

interface UseVoiceCommandsProps {
  onTranscript: (text: string) => void;
  onInterimTranscript?: (text: string) => void;
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void; // Called when speech ends but no transcript (noise/echo)
  active?: boolean;
  inputDeviceId?: string;
  isSpeaking?: boolean;
}

const MISTRAL_API_KEY =
  Constants.expoConfig?.extra?.MISTRAL_API_KEY ??
  process.env.EXPO_PUBLIC_MISTRAL_API_KEY ??
  process.env.MISTRAL_API_KEY ??
  "";

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

async function loadVAD(): Promise<any> {
  const win = window as any;

  if (win.vad?.MicVAD) {
    return win.vad;
  }

  await loadScript("https://cdn.jsdelivr.net/npm/onnxruntime-web@1.14.0/dist/ort.min.js");

  if (win.ort) {
    win.ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.14.0/dist/";
  }

  await loadScript("https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.19/dist/bundle.min.js");

  if (!win.vad?.MicVAD) {
    throw new Error("VAD library not loaded");
  }

  return win.vad;
}

// SSE streaming transcription
async function transcribeStream(
  audioChunks: Int16Array[],
  onInterim: (text: string) => void,
  onFinal: (text: string) => void,
  onError: (error: string) => void
): Promise<void> {
  // Build WAV from chunks
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

  const wav = new Blob([buffer], { type: "audio/wav" });

  const formData = new FormData();
  formData.append("model", "voxtral-mini-2602");
  formData.append("file", wav, "audio.wav");
  formData.append("language", "ja");
  formData.append("stream", "true");

  try {
    const resp = await fetch("https://api.mistral.ai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${MISTRAL_API_KEY}` },
      body: formData,
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      onError(`Voxtral API ${resp.status}: ${errBody}`);
      return;
    }

    const reader = resp.body?.getReader();
    if (!reader) return;

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

    if (fullText.trim()) {
      onFinal(fullText.trim());
    }
  } catch (err: any) {
    onError(err.message ?? "Transcription failed");
  }
}

export function useVoiceCommands({
  onTranscript,
  onInterimTranscript,
  onSpeechStart,
  onSpeechEnd,
  active = true,
  inputDeviceId,
  isSpeaking = false,
}: UseVoiceCommandsProps) {
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const vadRef = useRef<any>(null);
  const activeRef = useRef(active);
  activeRef.current = active;

  const isSpeakingRef = useRef(isSpeaking);
  isSpeakingRef.current = isSpeaking;

  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  const onInterimTranscriptRef = useRef(onInterimTranscript);
  onInterimTranscriptRef.current = onInterimTranscript;

  const onSpeechStartRef = useRef(onSpeechStart);
  onSpeechStartRef.current = onSpeechStart;

  const onSpeechEndRef = useRef(onSpeechEnd);
  onSpeechEndRef.current = onSpeechEnd;

  // Audio chunks buffer for realtime streaming
  const audioChunksRef = useRef<Int16Array[]>([]);
  const isRecordingRef = useRef(false);

  const startListening = useCallback(async () => {
    if (!activeRef.current) return;
    if (Platform.OS !== "web") return;

    try {
      setError(null);

      const vadLib = await loadVAD();

      const vad = await vadLib.MicVAD.new({
        positiveSpeechThreshold: 0.85,
        negativeSpeechThreshold: 0.4,
        redemptionFrames: 6,
        preSpeechPadFrames: 3,
        minSpeechFrames: 3,
        additionalAudioConstraints: {
          deviceId: inputDeviceId && inputDeviceId !== "default"
            ? { exact: inputDeviceId }
            : undefined,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        workletURL: "https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.19/dist/vad.worklet.bundle.min.js",
        modelURL: "https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.19/dist/silero_vad.onnx",
        onSpeechStart: () => {
          console.log("Speech started, isSpeaking:", isSpeakingRef.current);
          isRecordingRef.current = true;
          audioChunksRef.current = [];

          if (isSpeakingRef.current) {
            console.log("User interrupted AI speech");
            onSpeechStartRef.current?.();
          }
        },
        onFrameProcessed: (probs: { isSpeech: number }, frame: Float32Array) => {
          // Collect audio chunks while recording
          if (isRecordingRef.current && frame) {
            const pcm16 = new Int16Array(frame.length);
            for (let i = 0; i < frame.length; i++) {
              const s = Math.max(-1, Math.min(1, frame[i]));
              pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
            }
            audioChunksRef.current.push(pcm16);
          }
        },
        onSpeechEnd: async (audio: Float32Array) => {
          if (!activeRef.current) return;
          isRecordingRef.current = false;

          // Convert final audio to PCM16
          const pcm16 = new Int16Array(audio.length);
          for (let i = 0; i < audio.length; i++) {
            const s = Math.max(-1, Math.min(1, audio[i]));
            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
          }

          console.log("Speech ended, streaming transcription...", audio.length, "samples");

          let gotTranscript = false;

          // Use streaming transcription
          await transcribeStream(
            [pcm16],
            (interim) => {
              console.log("Interim:", interim);
              onInterimTranscriptRef.current?.(interim);
            },
            (final) => {
              console.log("Final:", final);
              gotTranscript = true;
              onTranscriptRef.current(final);
            },
            (err) => {
              console.error("Transcription error:", err);
              setError(err);
            }
          );

          // If no transcript was produced (noise/echo), notify with empty to reset state
          if (!gotTranscript) {
            console.log("No transcript produced, signaling speech end without content");
            onSpeechEndRef.current?.();
          }
        },
      });

      vad.start();
      vadRef.current = vad;
      setIsListening(true);
      console.log("Silero VAD started with realtime transcription");
    } catch (e) {
      console.error("VAD init error:", e);
      setError(e instanceof Error ? e.message : "音声認識の開始に失敗しました");
      setIsListening(false);
    }
  }, [inputDeviceId]);

  const stopListening = useCallback(() => {
    vadRef.current?.pause();
    vadRef.current?.destroy();
    vadRef.current = null;
    isRecordingRef.current = false;
    audioChunksRef.current = [];
    setIsListening(false);
  }, []);

  useEffect(() => {
    if (active) {
      startListening();
    } else {
      stopListening();
    }
    return () => {
      stopListening();
    };
  }, [active, startListening, stopListening]);

  return {
    isListening,
    error,
    startListening,
    stopListening,
  };
}
