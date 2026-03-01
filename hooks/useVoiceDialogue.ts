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

interface VoxtralDialogueResult {
  assistantReply: string;
  intent?: string;
  userText?: string;
  raw?: string;
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
  const currentIndexRef = useRef<number>(currentIndex);
  const stepsRef = useRef<Array<{ text: string }>>(steps);
  const tasksRef = useRef<GanttTask[]>(tasks);
  const listeningTurnInFlightRef = useRef(false);

  // Track what AI was saying when interrupted
  const currentSpeechTextRef = useRef<string>("");
  const lastSpeechEndedAtRef = useRef<number>(0);
  const lastAssistantUtteranceRef = useRef<string>("");

  const normalizeSpeechText = useCallback((text: string): string => {
    return String(text ?? "")
      .toLowerCase()
      .replace(/[\s\u3000]/g, "")
      .replace(/[。、，,.!！?？「」『』（）()［］[\]{}]/g, "")
      .trim();
  }, []);

  const hasSubstantialOverlap = useCallback(
    (a: string, b: string): boolean => {
      const na = normalizeSpeechText(a);
      const nb = normalizeSpeechText(b);
      if (!na || !nb) return false;
      const shorter = na.length <= nb.length ? na : nb;
      const longer = na.length > nb.length ? na : nb;
      // Japanese command phrases are often short ("次の工程です" etc.)
      if (shorter.length < 4) return false;
      return longer.includes(shorter);
    },
    [normalizeSpeechText],
  );

  const setListeningResume = useCallback((fn: () => void) => {
    listeningResumeRef.current = fn;
  }, []);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    stepsRef.current = steps;
  }, [steps]);

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

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
    if (!cacheDir || typeof FS.writeAsStringAsync !== "function") {
      return null;
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
      if (!uri) {
        throw new Error("No writable directory available for audio cache");
      }
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
      if (!startBgmUri) {
        if (Platform.OS === "web") {
          (globalThis as any).__e2eStartBgm = {
            attemptedAt: Date.now(),
            startedAt: Date.now(),
            error: null,
            skippedNoSource: true,
          };
        }
        return;
      }
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
      currentSpeechTextRef.current = text;
      lastAssistantUtteranceRef.current = text;
      setDialogueState("speaking");
      if (config?.tts === "offline_expospeech") {
        try {
          await speakWithExpoSpeech(text);
        } finally {
          lastSpeechEndedAtRef.current = Date.now();
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
        const msg = String(e);
        const isNoWritableCache = msg.includes(
          "No writable directory available for audio cache",
        );
        if (__DEV__ && !isNoWritableCache) {
          // eslint-disable-next-line no-console
          console.warn("[voice] speakText failed:", e);
        }
        await speakWithExpoSpeech(text);
      } finally {
        // Only transition to listening if we weren't interrupted
        lastSpeechEndedAtRef.current = Date.now();
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
      let guidance = stepText;
      try {
        guidance = await generateStepGuidance(
          stepText,
          0,
          steps.length,
          recipeName,
          recipeContext,
        );
      } catch (e) {
        if (__DEV__) {
          // eslint-disable-next-line no-console
          console.warn("[voice] generateStepGuidance failed:", e);
        }
      }
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

  // Called when speech ends but no transcript was produced (noise/echo)
  // Reset from interrupted state back to listening
  const resetFromInterrupted = useCallback(() => {
    setDialogueState((prev) => (prev === "interrupted" ? "listening" : prev));
  }, []);

  const processUserInput = useCallback(
    async (transcript: string) => {
      const prevStateSnapshot = dialogueState;
      const needsListeningLock = prevStateSnapshot === "listening";
      if (needsListeningLock && listeningTurnInFlightRef.current) {
        if (__DEV__) {
          // eslint-disable-next-line no-console
          console.warn("[voice] dropped overlapping transcript:", transcript);
        }
        return;
      }
      if (needsListeningLock) {
        listeningTurnInFlightRef.current = true;
      }

      try {
        const prevState = prevStateSnapshot;
        const now = Date.now();
        const withinEchoWindow = now - lastSpeechEndedAtRef.current < 2500;
        const looksLikeEcho =
          withinEchoWindow &&
          hasSubstantialOverlap(
            transcript,
            lastAssistantUtteranceRef.current || lastResponse,
          );

        if (looksLikeEcho) {
          if (__DEV__) {
            // eslint-disable-next-line no-console
            console.warn("[voice] ignored likely echo transcript:", transcript);
          }
          setDialogueState((prev) =>
            prev === "processing" || prev === "interrupted" ? "listening" : prev,
          );
          return;
        }

        // speaking/interrupted中の発話も通常intent処理に統一する
        // （説明だけ進んで工程が進まない競合を防ぐ）
        if (prevState === "interrupted" || prevState === "speaking") {
          currentSpeechTextRef.current = "";
          await stopSpeaking();
        } else if (prevState !== "listening") {
          return;
        }

        setDialogueState("processing");

        setConversationHistory((prev) => [
          ...prev,
          { role: "user", content: transcript },
        ]);

        const idx = currentIndexRef.current;
        const localSteps = stepsRef.current;
        const localTasks = tasksRef.current;
        const currentStep = stripHtml(localSteps[idx]?.text ?? "");
        const prevStep =
          idx > 0 ? stripHtml(localSteps[idx - 1].text) : null;
        const nextStep =
          idx < localSteps.length - 1
            ? stripHtml(localSteps[idx + 1].text)
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
            if (idx >= localSteps.length - 1) {
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
            const nextIdx = idx + 1;
            currentIndexRef.current = nextIdx;
            onChangeIndex(nextIdx);
            const guidance = await generateStepGuidance(
              stripHtml(localSteps[nextIdx].text),
              nextIdx,
              localSteps.length,
              recipeName,
              recipeContext,
            );
            response = `次の工程です。${guidance}`;
            break;
          }

          case "previous_step": {
            if (idx <= 0) {
              response = "最初の工程です。" + currentStep;
            } else {
              const prevIdx = idx - 1;
              currentIndexRef.current = prevIdx;
              onChangeIndex(prevIdx);
              const guidance = await generateStepGuidance(
                stripHtml(localSteps[prevIdx].text),
                prevIdx,
                localSteps.length,
                recipeName,
                recipeContext,
              );
              response = `前の工程に戻ります。${guidance}`;
            }
            break;
          }

          case "question": {
            const stepProgress = `工程${idx + 1}/${localSteps.length}`;
            const currentStepTip = recipeContext?.stepTips?.[idx] ?? null;
            response = await answerQuestion(
              transcript,
              currentStep,
              stepProgress,
              conversationHistory,
              recipeContext,
              currentStepTip,
            );
            break;
          }

          case "timer_status": {
            const task = localTasks[idx];
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
      } catch (e) {
        if (__DEV__) {
          // eslint-disable-next-line no-console
          console.warn("[voice] processUserInput failed:", e);
        }
        const fallbackResponse =
          "通信エラーが発生しました。もう一度ゆっくり話してください。";
        setLastResponse(fallbackResponse);
        setConversationHistory((prev) => [
          ...prev,
          { role: "assistant", content: fallbackResponse },
        ]);
        try {
          await speakText(fallbackResponse);
        } catch {
          setDialogueState((prev) =>
            prev === "processing" || prev === "interrupted" ? "listening" : prev,
          );
        }
      } finally {
        if (needsListeningLock) {
          listeningTurnInFlightRef.current = false;
        }
      }
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
      hasSubstantialOverlap,
      lastResponse,
    ],
  );

  const processVoxtralDialogueResult = useCallback(
    async (result: VoxtralDialogueResult) => {
      const response = String(result.assistantReply ?? "").trim();
      if (!response) return;

      const userText = String(result.userText ?? "").trim();
      const echoProbe = userText || String(result.raw ?? "").trim();
      const withinEchoWindow = Date.now() - lastSpeechEndedAtRef.current < 2500;
      const looksLikeEcho =
        withinEchoWindow &&
        hasSubstantialOverlap(
          echoProbe,
          lastAssistantUtteranceRef.current || lastResponse,
        );
      if (looksLikeEcho) {
        if (__DEV__) {
          // eslint-disable-next-line no-console
          console.warn("[voice] ignored likely dialogue echo:", echoProbe);
        }
        setDialogueState((prev) =>
          prev === "processing" || prev === "interrupted" ? "listening" : prev,
        );
        return;
      }

      const intent = String(result.intent ?? "").trim();
      await stopSpeaking();
      setDialogueState("processing");

      const idx = currentIndexRef.current;
      const localSteps = stepsRef.current;
      if (intent === "next_step" && idx < localSteps.length - 1) {
        const nextIdx = idx + 1;
        currentIndexRef.current = nextIdx;
        onChangeIndex(nextIdx);
      } else if (intent === "previous_step" && idx > 0) {
        const prevIdx = idx - 1;
        currentIndexRef.current = prevIdx;
        onChangeIndex(prevIdx);
      }

      setConversationHistory((prev) => {
        const next = [...prev];
        if (userText) next.push({ role: "user", content: userText });
        next.push({ role: "assistant", content: response });
        return next;
      });
      setLastResponse(response);
      await speakText(response);

      if (intent === "end_session") {
        onSessionEnd();
      }
    },
    [
      hasSubstantialOverlap,
      lastResponse,
      onChangeIndex,
      onSessionEnd,
      speakText,
      stopSpeaking,
    ],
  );

  return {
    dialogueState,
    conversationHistory,
    lastResponse,
    processUserInput,
    processVoxtralDialogueResult,
    interrupt,
    stopSpeaking,
    setListeningResume,
    resetFromInterrupted,
  };
}
