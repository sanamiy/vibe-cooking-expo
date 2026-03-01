import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { Audio } from "expo-av";
import { transcribeFile, transcribeStream } from "@/services/voxtralAsr";

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
  const nativeRecordingRef = useRef<Audio.Recording | null>(null);
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

  const nativeVadRef = useRef({
    hasSpeech: false,
    speechStartMs: 0,
    lastVoiceMs: 0,
    recordingStartMs: 0,
  });

  const getMimeTypeFromUri = (uri: string): string => {
    const lower = uri.toLowerCase();
    if (lower.endsWith(".m4a")) return "audio/m4a";
    if (lower.endsWith(".mp4")) return "audio/mp4";
    if (lower.endsWith(".3gp")) return "audio/3gpp";
    if (lower.endsWith(".wav")) return "audio/wav";
    if (lower.endsWith(".mp3")) return "audio/mpeg";
    if (lower.endsWith(".ogg")) return "audio/ogg";
    if (lower.endsWith(".flac")) return "audio/flac";
    return "audio/m4a";
  };

  const stopNativeRecording = useCallback(async () => {
    const rec = nativeRecordingRef.current;
    nativeRecordingRef.current = null;
    if (!rec) return;

    try {
      rec.setOnRecordingStatusUpdate(null);
    } catch {
      // ignore
    }

    try {
      const status = await rec.getStatusAsync();
      if (status.isRecording) {
        await rec.stopAndUnloadAsync();
      }
    } catch {
      // ignore
    }
  }, []);

  const startNativeLoop = useCallback(async () => {
    if (!activeRef.current) return;
    if (Platform.OS === "web") return;

    try {
      setError(null);

      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        setError("マイクへのアクセスが許可されていません");
        setIsListening(false);
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const thresholdDb = -28;
      const minSpeechMs = 250;
      const endSilenceMs = 600;
      const maxUtteranceMs = 8000;
      const statusIntervalMs = 100;

      const rec = new Audio.Recording();
      nativeRecordingRef.current = rec;

      // Ensure we get metering updates.
      await rec.prepareToRecordAsync({
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        isMeteringEnabled: true,
      } as any);

      const state = nativeVadRef.current;
      state.hasSpeech = false;
      state.speechStartMs = 0;
      state.lastVoiceMs = 0;
      state.recordingStartMs = Date.now();

      rec.setProgressUpdateInterval(statusIntervalMs);

      rec.setOnRecordingStatusUpdate(async (st: any) => {
        if (!activeRef.current) return;
        if (!st?.isRecording) return;

        const now = Date.now();
        const metering = typeof st.metering === "number" ? st.metering : null;
        const isVoice = metering !== null && metering > thresholdDb;

        if (isVoice) {
          if (!state.hasSpeech) {
            if (state.speechStartMs === 0) state.speechStartMs = now;
            if (now - state.speechStartMs >= minSpeechMs) {
              state.hasSpeech = true;
              state.lastVoiceMs = now;

              if (isSpeakingRef.current) {
                onSpeechStartRef.current?.();
              }
            }
          } else {
            state.lastVoiceMs = now;
          }
        }

        const utteranceTooLong = now - state.recordingStartMs >= maxUtteranceMs;
        const silenceLongEnough =
          state.hasSpeech && now - state.lastVoiceMs >= endSilenceMs;

        if (utteranceTooLong || silenceLongEnough) {
          const currentRec = nativeRecordingRef.current;
          if (!currentRec) return;

          // Detach first to avoid re-entrancy.
          nativeRecordingRef.current = null;
          try {
            currentRec.setOnRecordingStatusUpdate(null);
          } catch {
            // ignore
          }

          try {
            await currentRec.stopAndUnloadAsync();
          } catch (e) {
            setError(
              e instanceof Error ? e.message : "録音の停止に失敗しました",
            );
            setIsListening(false);
            return;
          }

          const uri = currentRec.getURI();
          if (!uri) {
            // Restart loop even if no uri.
            nativeVadRef.current.speechStartMs = 0;
            nativeVadRef.current.hasSpeech = false;
            nativeVadRef.current.lastVoiceMs = 0;
            nativeVadRef.current.recordingStartMs = 0;
            if (activeRef.current) {
              startNativeLoop();
            }
            return;
          }

          let gotTranscript = false;
          await transcribeFile(
            {
              uri,
              mimeType: getMimeTypeFromUri(uri),
              filename: uri.split("/").pop() ?? "audio.m4a",
            },
            (interim) => {
              onInterimTranscriptRef.current?.(interim);
            },
            (final) => {
              gotTranscript = true;
              onTranscriptRef.current(final);
            },
            (err) => {
              setError(err);
            },
          );

          if (!gotTranscript) {
            onSpeechEndRef.current?.();
          }

          // Continue always-listening.
          if (activeRef.current) {
            startNativeLoop();
          }
        }
      });

      await rec.startAsync();
      setIsListening(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "音声認識の開始に失敗しました");
      setIsListening(false);
    }
  }, []);

  const startListening = useCallback(async () => {
    if (!activeRef.current) return;
    if (Platform.OS !== "web") {
      await startNativeLoop();
      return;
    }

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
    if (Platform.OS === "web") {
      vadRef.current?.pause();
      vadRef.current?.destroy();
      vadRef.current = null;
      isRecordingRef.current = false;
      audioChunksRef.current = [];
      setIsListening(false);
      return;
    }

    stopNativeRecording().finally(() => {
      setIsListening(false);
    });
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
