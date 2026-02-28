import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system";
import * as Speech from "expo-speech";
import {
  classifyIntent,
  answerQuestion,
  generateStepGuidance,
  synthesizeSpeech,
  handleBargeIn,
  type RecipeContext,
} from "@/services/ai";
import { stripHtml } from "@/utils/recipe";
import { GanttTask } from "@/utils/gantt";

const FS = FileSystem as any;

// config.json example:
// { "tts": "offline_expospeech" } | { "tts": "online_elevenlabs" }
const config = require("@/config.json") as { tts?: string };

export type DialogueState =
  | "listening"
  | "processing"
  | "speaking"
  | "interrupted";

interface ConversationEntry {
  role: "user" | "assistant";
  content: string;
}

interface UseVoiceDialogueProps {
  steps: Array<{ text: string }>;
  tasks: GanttTask[];
  recipeName: string;
  currentIndex: number;
  outputDeviceId?: string;
  startBgmUri?: string | number;
  onChangeIndex: (index: number) => void;
  onSessionEnd: () => void;
  recipeContext?: RecipeContext;
}

export function useVoiceDialogue({
  steps,
  tasks,
  recipeName,
  currentIndex,
  outputDeviceId,
  startBgmUri,
  onChangeIndex,
  onSessionEnd,
  recipeContext,
}: UseVoiceDialogueProps) {
  const [dialogueState, setDialogueState] =
    useState<DialogueState>("listening");
  const [conversationHistory, setConversationHistory] = useState<
    ConversationEntry[]
  >([]);
  const [lastResponse, setLastResponse] = useState("");

  const soundRef = useRef<Audio.Sound | null>(null);
  const webAudioRef = useRef<any>(null);
  const nativeAudioUriRef = useRef<string | null>(null);
  const isInitializedRef = useRef(false);
  const listeningResumeRef = useRef<(() => void) | null>(null);

  const startBgmSoundRef = useRef<Audio.Sound | null>(null);

  // Track what AI was saying when interrupted
  const currentSpeechTextRef = useRef<string>("");

  const setListeningResume = useCallback((fn: () => void) => {
    listeningResumeRef.current = fn;
  }, []);

  const speakWithExpoSpeech = useCallback((text: string) => {
    if (Platform.OS === "web") return Promise.resolve();
    return new Promise<void>((resolve) => {
      try {
        Speech.speak(text, {
          onDone: () => resolve(),
          onStopped: () => resolve(),
          onError: () => resolve(),
        });
      } catch {
        resolve();
      }
    });
  }, []);

  // Stop any playing audio immediately
  const stopSpeaking = useCallback(async () => {
    if (Platform.OS === "web") {
      if (webAudioRef.current) {
        webAudioRef.current.pause();
        webAudioRef.current = null;
      }
    } else {
      try {
        Speech.stop();
      } catch {
        // ignore
      }
      if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }

      if (nativeAudioUriRef.current) {
        const uri = nativeAudioUriRef.current;
        nativeAudioUriRef.current = null;
        FS.deleteAsync(uri, { idempotent: true }).catch(() => {});
      }
    }
  }, []);

  const writeBase64Mp3ToCache = useCallback(async (base64Audio: string) => {
    const cacheDir = FS.cacheDirectory ?? FS.documentDirectory;
    if (!cacheDir) {
      throw new Error("No writable directory available for audio cache");
    }
    const uri = `${cacheDir}voice-${Date.now()}.mp3`;
    await FS.writeAsStringAsync(uri, base64Audio, {
      encoding: FS.EncodingType.Base64,
    });
    return uri;
  }, []);

  const playAudio = useCallback(
    async (base64Audio: string) => {
      if (Platform.OS === "web") {
        return new Promise<void>((resolve) => {
          const AudioCtor = (globalThis as any).Audio;
          const audio = new AudioCtor(`data:audio/mpeg;base64,${base64Audio}`);
          webAudioRef.current = audio;
          if (
            outputDeviceId &&
            outputDeviceId !== "default" &&
            "setSinkId" in audio
          ) {
            (audio as any).setSinkId(outputDeviceId).catch(() => {});
          }
          audio.onended = () => {
            webAudioRef.current = null;
            resolve();
          };
          audio.onerror = () => {
            webAudioRef.current = null;
            resolve();
          };
          audio.play();
        });
      }

      if (soundRef.current) {
        await soundRef.current.unloadAsync();
      }

      if (nativeAudioUriRef.current) {
        await FS.deleteAsync(nativeAudioUriRef.current, { idempotent: true });
        nativeAudioUriRef.current = null;
      }

      const uri = await writeBase64Mp3ToCache(base64Audio);
      nativeAudioUriRef.current = uri;

      const { sound } = await Audio.Sound.createAsync({
        uri,
      });
      soundRef.current = sound;
      await sound.playAsync();
      return new Promise<void>((resolve) => {
        sound.setOnPlaybackStatusUpdate((status) => {
          if (status.isLoaded && status.didJustFinish) {
            resolve();
          }
        });
      });
    },
    [outputDeviceId, writeBase64Mp3ToCache],
  );

  const stopStartBgm = useCallback(async () => {
    if (startBgmSoundRef.current) {
      const s = startBgmSoundRef.current;
      startBgmSoundRef.current = null;
      try {
        await s.stopAsync();
      } catch {
        // ignore
      }
      try {
        await s.unloadAsync();
      } catch {
        // ignore
      }
    }
  }, []);

  const playStartBgmForMs = useCallback(
    async (ms: number) => {
      if (!startBgmUri) return;
      await stopStartBgm();
      try {
        if (Platform.OS === "web") {
          (globalThis as any).__e2eStartBgm = {
            attemptedAt: Date.now(),
            startedAt: null,
            error: null,
          };
        }
        const source =
          typeof startBgmUri === "string" ? { uri: startBgmUri } : startBgmUri;
        const { sound } = await Audio.Sound.createAsync(source, {
          shouldPlay: true,
        });
        startBgmSoundRef.current = sound;

        if (Platform.OS === "web") {
          (globalThis as any).__e2eStartBgm.startedAt = Date.now();
        }
        await new Promise<void>((resolve) => {
          const t = setTimeout(() => resolve(), ms);
          sound.setOnPlaybackStatusUpdate((status) => {
            if (status.isLoaded && status.didJustFinish) {
              clearTimeout(t);
              resolve();
            }
          });
        });
      } catch (e) {
        if (Platform.OS === "web") {
          (globalThis as any).__e2eStartBgm = {
            attemptedAt: Date.now(),
            startedAt: null,
            error: String(e),
          };
        }
        if (__DEV__) {
          // eslint-disable-next-line no-console
          console.warn("[voice] startBgm failed:", e);
        }
      } finally {
        await stopStartBgm();
      }
    },
    [startBgmUri, stopStartBgm],
  );

  const speakText = useCallback(
    async (text: string) => {
      setDialogueState("speaking");
      if (config?.tts === "offline_expospeech") {
        try {
          await speakWithExpoSpeech(text);
        } finally {
          currentSpeechTextRef.current = "";
          setDialogueState((prev) =>
            prev === "speaking" ? "listening" : prev,
          );
          listeningResumeRef.current?.();
        }
        return;
      }
      try {
        const audio = await synthesizeSpeech(text);
        await playAudio(audio);
      } catch (e) {
        // Don't crash the app if audio playback fails.
        if (__DEV__) {
          // eslint-disable-next-line no-console
          console.warn("[voice] speakText failed:", e);
        }
        await speakWithExpoSpeech(text);
      } finally {
        // Only transition to listening if we weren't interrupted
        currentSpeechTextRef.current = "";
        setDialogueState((prev) => (prev === "speaking" ? "listening" : prev));
        listeningResumeRef.current?.();
      }
    },
    [playAudio, speakWithExpoSpeech],
  );

  // Initial greeting
  useEffect(() => {
    if (isInitializedRef.current || steps.length === 0) return;
    isInitializedRef.current = true;

    (async () => {
      setDialogueState("processing");
      await playStartBgmForMs(5000);
      const stepText = stripHtml(steps[0].text);
      const guidance = await generateStepGuidance(
        stepText,
        0,
        steps.length,
        recipeName,
        recipeContext,
      );
      const greeting = `${recipeName}の調理を始めましょう。${guidance}`;
      setLastResponse(greeting);
      setConversationHistory([{ role: "assistant", content: greeting }]);
      await speakText(greeting);
    })();
  }, [steps, recipeName, speakText, playStartBgmForMs]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      soundRef.current?.unloadAsync();
      startBgmSoundRef.current?.unloadAsync();
      if (nativeAudioUriRef.current) {
        FS.deleteAsync(nativeAudioUriRef.current, { idempotent: true }).catch(
          () => {},
        );
        nativeAudioUriRef.current = null;
      }
      if (webAudioRef.current) {
        webAudioRef.current.pause();
        webAudioRef.current = null;
      }
    };
  }, []);

  // Called when user speaks while AI is talking → interrupt
  const interrupt = useCallback(async () => {
    await stopSpeaking();
    setDialogueState("interrupted");
  }, [stopSpeaking]);

  const processUserInput = useCallback(
    async (transcript: string) => {
      const prevState = dialogueState;

      // If we were interrupted, handle barge-in logic
      if (prevState === "interrupted" || prevState === "speaking") {
        const interruptedText = currentSpeechTextRef.current;
        currentSpeechTextRef.current = "";
        await stopSpeaking();
        setDialogueState("processing");

        setConversationHistory((prev) => [
          ...prev,
          { role: "user", content: transcript },
        ]);

        const currentStep = stripHtml(steps[currentIndex]?.text ?? "");
        const stepProgress = `工程${currentIndex + 1}/${steps.length}`;

        const result = await handleBargeIn(
          transcript,
          interruptedText,
          currentStep,
          stepProgress,
          conversationHistory,
          recipeContext,
        );

        setLastResponse(result.response);
        setConversationHistory((prev) => [
          ...prev,
          { role: "assistant", content: result.response },
        ]);
        await speakText(result.response);
        return;
      }

      if (prevState !== "listening") return;

      setDialogueState("processing");

      setConversationHistory((prev) => [
        ...prev,
        { role: "user", content: transcript },
      ]);

      const currentStep = stripHtml(steps[currentIndex]?.text ?? "");
      const prevStep =
        currentIndex > 0 ? stripHtml(steps[currentIndex - 1].text) : null;
      const nextStep =
        currentIndex < steps.length - 1
          ? stripHtml(steps[currentIndex + 1].text)
          : null;

      const intent = await classifyIntent(
        transcript,
        currentStep,
        prevStep,
        nextStep,
        recipeName,
      );

      let response = "";

      switch (intent) {
        case "next_step": {
          if (currentIndex >= steps.length - 1) {
            response = "すべての工程が完了しました。お疲れさまでした！";
            setLastResponse(response);
            setConversationHistory((prev) => [
              ...prev,
              { role: "assistant", content: response },
            ]);
            await speakText(response);
            onSessionEnd();
            return;
          }
          const nextIdx = currentIndex + 1;
          onChangeIndex(nextIdx);
          const guidance = await generateStepGuidance(
            stripHtml(steps[nextIdx].text),
            nextIdx,
            steps.length,
            recipeName,
            recipeContext,
          );
          response = `次の工程です。${guidance}`;
          break;
        }

        case "previous_step": {
          if (currentIndex <= 0) {
            response = "最初の工程です。" + currentStep;
          } else {
            const prevIdx = currentIndex - 1;
            onChangeIndex(prevIdx);
            const guidance = await generateStepGuidance(
              stripHtml(steps[prevIdx].text),
              prevIdx,
              steps.length,
              recipeName,
              recipeContext,
            );
            response = `前の工程に戻ります。${guidance}`;
          }
          break;
        }

        case "question": {
          const stepProgress = `工程${currentIndex + 1}/${steps.length}`;
          response = await answerQuestion(
            transcript,
            currentStep,
            stepProgress,
            conversationHistory,
            recipeContext,
          );
          break;
        }

        case "timer_status": {
          const task = tasks[currentIndex];
          if (task?.requires_timer && task.timer_minutes) {
            response = `この工程のタイマーは${task.timer_minutes}分です。`;
          } else {
            response = "この工程にはタイマーは設定されていません。";
          }
          break;
        }

        case "end_session": {
          response = "調理ナビを終了します。お疲れさまでした。";
          setLastResponse(response);
          setConversationHistory((prev) => [
            ...prev,
            { role: "assistant", content: response },
          ]);
          await speakText(response);
          onSessionEnd();
          return;
        }
      }

      setLastResponse(response);
      setConversationHistory((prev) => [
        ...prev,
        { role: "assistant", content: response },
      ]);
      await speakText(response);
    },
    [
      dialogueState,
      steps,
      currentIndex,
      tasks,
      recipeName,
      conversationHistory,
      onChangeIndex,
      onSessionEnd,
      speakText,
      stopSpeaking,
      recipeContext,
    ],
  );

  return {
    dialogueState,
    conversationHistory,
    lastResponse,
    processUserInput,
    interrupt,
    stopSpeaking,
    setListeningResume,
  };
}
