import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { VoxtralRealtimeClient } from "@/services/voxtralRealtime";
import { AudioCapture } from "@/services/audioCapture";
import Constants from "expo-constants";

export type VoiceCommand = "NEXT" | "PREVIOUS" | "REPEAT" | "UNKNOWN";

interface UseVoiceCommandsProps {
  onCommand: (command: VoiceCommand) => void;
  onTranscript?: (text: string) => void;
  active?: boolean;
  inputDeviceId?: string;
}

const MISTRAL_API_KEY =
  Constants.expoConfig?.extra?.MISTRAL_API_KEY ??
  process.env.EXPO_PUBLIC_MISTRAL_API_KEY ??
  process.env.MISTRAL_API_KEY ??
  "";

export function useVoiceCommands({
  onCommand,
  onTranscript,
  active = true,
  inputDeviceId,
}: UseVoiceCommandsProps) {
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const voxtralRef = useRef<VoxtralRealtimeClient | null>(null);
  const captureRef = useRef<AudioCapture | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;

  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;
  const onCommandRef = useRef(onCommand);
  onCommandRef.current = onCommand;

  const parseCommand = useCallback((text: string): VoiceCommand => {
    const normalized = text.toLowerCase().replace(/\s+/g, "");

    if (
      normalized.includes("次") ||
      normalized.includes("できた") ||
      normalized.includes("終わった") ||
      normalized.includes("ok") ||
      normalized.includes("オーケー") ||
      normalized.includes("次へ")
    ) {
      return "NEXT";
    }

    if (
      normalized.includes("前") ||
      normalized.includes("戻って") ||
      normalized.includes("バック")
    ) {
      return "PREVIOUS";
    }

    if (
      normalized.includes("もう一回") ||
      normalized.includes("もう1回") ||
      normalized.includes("リピート") ||
      normalized.includes("え") ||
      normalized.includes("何") ||
      normalized.includes("なんて")
    ) {
      return "REPEAT";
    }

    return "UNKNOWN";
  }, []);

  const startListening = useCallback(async () => {
    if (!activeRef.current) return;
    if (Platform.OS !== "web") return;

    try {
      setError(null);

      const voxtral = new VoxtralRealtimeClient({
        apiKey: MISTRAL_API_KEY,
        onInterimTranscript: () => {},
        onFinalTranscript: (text) => {
          if (!activeRef.current || !text.trim()) return;
          onTranscriptRef.current?.(text);
          const command = parseCommand(text);
          if (command !== "UNKNOWN") {
            onCommandRef.current(command);
          }
        },
        onError: (err) => {
          console.error("Voxtral error:", err);
          setError(err);
        },
        onConnectionChange: (connected) => {
          setIsListening(connected);
        },
      });

      voxtral.connect();
      voxtralRef.current = voxtral;

      const capture = new AudioCapture();
      await capture.start({
        deviceId: inputDeviceId,
        onAudioChunk: (pcm16) => {
          voxtral.appendAudio(pcm16);
        },
        onError: (err) => {
          setError(err);
        },
      });
      captureRef.current = capture;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "音声認識の開始に失敗しました"
      );
      setIsListening(false);
    }
  }, [inputDeviceId, parseCommand]);

  const stopListening = useCallback(() => {
    voxtralRef.current?.disconnect();
    voxtralRef.current = null;
    captureRef.current?.stop();
    captureRef.current = null;
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

  useEffect(() => {
    if (isListening && inputDeviceId) {
      captureRef.current?.switchDevice(inputDeviceId);
    }
  }, [inputDeviceId, isListening]);

  return {
    isListening,
    error,
    startListening,
    stopListening,
  };
}
