import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface AudioDevice {
  deviceId: string;
  label: string;
  kind: "audioinput" | "audiooutput";
}

const STORAGE_KEY_INPUT = "audio-device-input";
const STORAGE_KEY_OUTPUT = "audio-device-output";

export function useAudioDevices() {
  const [inputDevices, setInputDevices] = useState<AudioDevice[]>([]);
  const [outputDevices, setOutputDevices] = useState<AudioDevice[]>([]);
  const [selectedInputId, setSelectedInputId] = useState<string>("default");
  const [selectedOutputId, setSelectedOutputId] = useState<string>("default");

  const loadDevices = useCallback(async () => {
    if (Platform.OS !== "web") return;
    try {
      const nav = globalThis.navigator as any;
      if (!nav?.mediaDevices?.enumerateDevices) return;
      const devices: any[] = await nav.mediaDevices.enumerateDevices();
      const inputs: AudioDevice[] = devices
        .filter((d: any) => d.kind === "audioinput")
        .map((d: any) => ({
          deviceId: d.deviceId,
          label: d.label || `マイク ${d.deviceId.slice(0, 8)}`,
          kind: "audioinput" as const,
        }));
      const outputs: AudioDevice[] = devices
        .filter((d: any) => d.kind === "audiooutput")
        .map((d: any) => ({
          deviceId: d.deviceId,
          label: d.label || `スピーカー ${d.deviceId.slice(0, 8)}`,
          kind: "audiooutput" as const,
        }));
      setInputDevices(inputs);
      setOutputDevices(outputs);
    } catch {
      // not supported
    }
  }, []);

  // Initial load + re-enumerate after permission is granted
  useEffect(() => {
    (async () => {
      const [savedInput, savedOutput] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEY_INPUT),
        AsyncStorage.getItem(STORAGE_KEY_OUTPUT),
      ]);
      if (savedInput) setSelectedInputId(savedInput);
      if (savedOutput) setSelectedOutputId(savedOutput);
    })();

    // First pass (may have empty labels / fewer devices)
    loadDevices();

    // After getUserMedia resolves, re-enumerate for full list with labels
    if (Platform.OS === "web") {
      const nav = globalThis.navigator as any;
      if (nav?.mediaDevices?.getUserMedia) {
        nav.mediaDevices
          .getUserMedia({ audio: true })
          .then((stream: any) => {
            // Stop tracks immediately – we only needed permission
            stream.getTracks().forEach((t: any) => t.stop());
            loadDevices();
          })
          .catch(() => {});
      }
      // Listen for device changes (plug/unplug)
      nav?.mediaDevices?.addEventListener?.("devicechange", loadDevices);
      return () => {
        nav?.mediaDevices?.removeEventListener?.("devicechange", loadDevices);
      };
    }
  }, [loadDevices]);

  const selectInput = useCallback(async (deviceId: string) => {
    setSelectedInputId(deviceId);
    await AsyncStorage.setItem(STORAGE_KEY_INPUT, deviceId);
  }, []);

  const selectOutput = useCallback(async (deviceId: string) => {
    setSelectedOutputId(deviceId);
    await AsyncStorage.setItem(STORAGE_KEY_OUTPUT, deviceId);
  }, []);

  return {
    inputDevices,
    outputDevices,
    selectedInputId,
    selectedOutputId,
    selectInput,
    selectOutput,
  };
}
