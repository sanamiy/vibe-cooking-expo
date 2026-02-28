import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { Audio } from "expo-av";
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
  const isInitializedRef = useRef(false);
  const listeningResumeRef = useRef<(() => void) | null>(null);

  // Track what AI was saying when interrupted
  const currentSpeechTextRef = useRef<string>("");

  const setListeningResume = useCallback((fn: () => void) => {
    listeningResumeRef.current = fn;
  }, []);

  // Stop any playing audio immediately
  const stopSpeaking = useCallback(async () => {
    if (Platform.OS === "web") {
      if (webAudioRef.current) {
        webAudioRef.current.pause();
        webAudioRef.current = null;
      }
    } else {
      if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
    }
  }, []);

  const playAudio = useCallback(
    async (base64Audio: string) => {
      if (Platform.OS === "web") {
        return new Promise<void>((resolve) => {
          const AudioCtor = (globalThis as any).Audio;
          const audio = new AudioCtor(
            `data:audio/mpeg;base64,${base64Audio}`
          );
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
      const { sound } = await Audio.Sound.createAsync({
        uri: `data:audio/mpeg;base64,${base64Audio}`,
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
    [outputDeviceId]
  );

  const speakText = useCallback(
    async (text: string) => {
      currentSpeechTextRef.current = text;
      setDialogueState("speaking");
      const audio = await synthesizeSpeech(text);
      await playAudio(audio);
      // Only transition to listening if we weren't interrupted
      currentSpeechTextRef.current = "";
      setDialogueState((prev) => (prev === "speaking" ? "listening" : prev));
      listeningResumeRef.current?.();
    },
    [playAudio]
  );

  // Initial greeting
  useEffect(() => {
    if (isInitializedRef.current || steps.length === 0) return;
    isInitializedRef.current = true;

    (async () => {
      setDialogueState("processing");
      const stepText = stripHtml(steps[0].text);
      const guidance = await generateStepGuidance(
        stepText,
        0,
        steps.length,
        recipeName,
        recipeContext
      );
      const greeting = `${recipeName}の調理を始めましょう。${guidance}`;
      setLastResponse(greeting);
      setConversationHistory([{ role: "assistant", content: greeting }]);
      await speakText(greeting);
    })();
  }, [steps, recipeName, speakText]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      soundRef.current?.unloadAsync();
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
          recipeContext
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
        recipeName
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
            recipeContext
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
              recipeContext
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
            recipeContext
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
    ]
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
