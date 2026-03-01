import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { transcribeStream } from "@/services/voxtralAsr";

interface UseVoiceCommandsProps {
  onTranscript: (text: string) => void;
  onInterimTranscript?: (text: string) => void;
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void; // Called when speech ends but no transcript (noise/echo)
  active?: boolean;
  inputDeviceId?: string;
  isSpeaking?: boolean;
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const doc = (globalThis as any).document as any;
    if (!doc) {
      reject(new Error("document is not available"));
      return;
    }
    if (doc.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = doc.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    doc.head.appendChild(script);
  });
}

async function loadVAD(): Promise<any> {
  const win = globalThis as any;

  if (win.vad?.MicVAD) {
    return win.vad;
  }

  await loadScript(
    "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.14.0/dist/ort.min.js",
  );

  if (win.ort) {
    win.ort.env.wasm.wasmPaths =
      "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.14.0/dist/";
  }

  await loadScript(
    "https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.19/dist/bundle.min.js",
  );

  if (!win.vad?.MicVAD) {
    throw new Error("VAD library not loaded");
  }

  return win.vad;
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
          deviceId:
            inputDeviceId && inputDeviceId !== "default"
              ? { exact: inputDeviceId }
              : undefined,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        workletURL:
          "https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.19/dist/vad.worklet.bundle.min.js",
        modelURL:
          "https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.19/dist/silero_vad.onnx",
        onSpeechStart: () => {
          console.log("Speech started, isSpeaking:", isSpeakingRef.current);
          isRecordingRef.current = true;
          audioChunksRef.current = [];

          if (isSpeakingRef.current) {
            console.log("User interrupted AI speech");
            onSpeechStartRef.current?.();
          }
        },
        onFrameProcessed: (
          probs: { isSpeech: number },
          frame: Float32Array,
        ) => {
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

          console.log(
            "Speech ended, streaming transcription...",
            audio.length,
            "samples",
          );

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
            },
          );

          // If no transcript was produced (noise/echo), notify with empty to reset state
          if (!gotTranscript) {
            console.log(
              "No transcript produced, signaling speech end without content",
            );
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
