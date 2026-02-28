import prebuiltGantt from "@/data/gantt/recipes-gantt.json";
import { theme } from "@/constants/theme";
import { useRecipes } from "@/hooks/useRecipes";
import { buildRecipeGantt, RecipeGanttData } from "@/utils/gantt";
import { stripHtml } from "@/utils/recipe";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
// import { useVoiceCommands } from "@/hooks/useVoiceCommands";
import { useVoiceDialogue } from "@/hooks/useVoiceDialogue";
import { VoiceDialoguePanel } from "@/components/VoiceDialoguePanel";
import { useAudioDevices } from "@/hooks/useAudioDevices";

const formatCountdownLabel = (countdown: number | null) => {
  if (countdown === null) return "";
  const mm = String(Math.floor(countdown / 60)).padStart(2, "0");
  const ss = String(countdown % 60).padStart(2, "0");
  return `${mm}:${ss}`;
};

const toSteps = (recipe: ReturnType<ReturnType<typeof useRecipes>["getRecipeById"]>) => {
  if (!recipe) return [] as Array<{ text: string }>;
  if (recipe.instruction_steps?.length)
    return recipe.instruction_steps.map((s) => ({ text: s.text }));
  return (recipe.instructions ?? []).map((text) => ({ text }));
};

export default function CookInteractiveScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getRecipeById } = useRecipes();
  const recipe = getRecipeById(String(id));

  const steps = useMemo(() => toSteps(recipe), [recipe]);

  const gantt = useMemo<RecipeGanttData>(() => {
    const prebuilt = (prebuiltGantt as { recipes?: RecipeGanttData[] }).recipes?.find(
      (r) => r.recipe_id === String(id),
    );
    return prebuilt ?? buildRecipeGantt(String(id), steps);
  }, [id, steps]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);

  const {
    inputDevices,
    outputDevices,
    selectedInputId,
    selectedOutputId,
    selectInput,
    selectOutput,
  } = useAudioDevices();

  // Voice dialogue session (auto-starts)
  const {
    dialogueState,
    conversationHistory,
    lastResponse,
    processUserInput,
    interrupt,
    stopSpeaking,
    setListeningResume,
  } = useVoiceDialogue({
    steps,
    tasks: gantt.tasks,
    recipeName: recipe?.name ?? "",
    currentIndex,
    outputDeviceId: selectedOutputId,
    onChangeIndex: setCurrentIndex,
    onSessionEnd: () => router.back(),
  });

  // Voice recognition – always active (even during speaking for barge-in)
  const handleTranscript = useCallback(
    (text: string) => {
      if (dialogueState === "speaking") {
        interrupt();
      }
      processUserInput(text);
    },
    [processUserInput, dialogueState, interrupt],
  );

  // TODO: restore useVoiceCommands after debug
  // const { isListening, startListening } = useVoiceCommands({
  //   onCommand: () => {},
  //   onTranscript: handleTranscript,
  //   active: dialogueState !== "processing",
  // });

  // useEffect(() => {
  //   setListeningResume(() => {
  //     if (!isListening) startListening();
  //   });
  // }, [setListeningResume, isListening, startListening]);

  // Timer countdown
  useEffect(() => {
    const task = gantt.tasks[currentIndex];
    if (!task?.requires_timer || !task.timer_minutes) {
      setCountdown(null);
      return;
    }

    let remaining = task.timer_minutes * 60;
    setCountdown(remaining);

    const interval = setInterval(() => {
      remaining -= 1;
      setCountdown(Math.max(0, remaining));
      if (remaining <= 0) clearInterval(interval);
    }, 1000);

    return () => clearInterval(interval);
  }, [currentIndex, gantt.tasks]);

  if (!recipe) return <SafeAreaView style={styles.safeArea} />;

  const currentStep = steps[currentIndex];
  const countdownLabel = formatCountdownLabel(countdown);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.back}>← 戻る</Text>
        </Pressable>
        <Text style={styles.title}>調理ナビ</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.recipeHeader}>
          <Text style={styles.recipe}>{recipe.name}</Text>
          <Text style={styles.meta}>
            ⏱ 推定 {gantt.total_estimated_minutes}分 / ステップ {steps.length}
          </Text>
        </View>

        {/* Current step card */}
        <View style={styles.card}>
          <View style={styles.stepHeader}>
            <View style={styles.stepBadge}>
              <Text style={styles.stepBadgeText}>
                STEP {currentIndex + 1} / {steps.length}
              </Text>
            </View>
          </View>
          <Text style={styles.stepText}>{stripHtml(currentStep?.text ?? "手順がありません")}</Text>
        </View>

        {/* Countdown timer */}
        {countdownLabel ? (
          <View style={styles.countdown}>
            <Text style={styles.countdownLabel}>タイマー</Text>
            <Text style={styles.countdownValue}>{countdownLabel}</Text>
          </View>
        ) : null}

        {/* Voice dialogue panel */}
        <VoiceDialoguePanel
          dialogueState={dialogueState}
          conversationHistory={conversationHistory}
          lastResponse={lastResponse}
          inputDevices={inputDevices}
          outputDevices={outputDevices}
          selectedInputId={selectedInputId}
          selectedOutputId={selectedOutputId}
          onSelectInput={selectInput}
          onSelectOutput={selectOutput}
        />

        {/* Gantt chart */}
        <View style={styles.card}>
          <Text style={styles.subTitle}>工程チャート</Text>
          {gantt.tasks.map((task) => {
            const total = Math.max(1, gantt.total_estimated_minutes);
            const left = `${(task.start_min / total) * 100}%`;
            const width = `${Math.max(8, (task.duration_min / total) * 100)}%`;
            const isActive = task.step_index - 1 === currentIndex;
            const isDone = task.step_index - 1 < currentIndex;
            return (
              <View key={task.task_id} style={styles.ganttRow}>
                <Text
                  style={[
                    styles.ganttLabel,
                    isActive && styles.activeLabel,
                    isDone && styles.doneLabel,
                  ]}
                >
                  {task.step_index}. {task.label}
                </Text>
                <View style={styles.track}>
                  <View
                    style={[
                      styles.bar,
                      { left: left as any, width: width as any },
                      isActive && styles.activeBar,
                      isDone && styles.doneBar,
                    ]}
                  />
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.bg },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.card,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  backBtn: {
    position: "absolute",
    left: 20,
    top: 20,
    zIndex: 1,
  },
  back: {
    color: theme.colors.subText,
    fontWeight: "700",
    fontSize: 14,
  },
  title: {
    color: theme.colors.primary,
    fontWeight: "800",
    fontSize: 20,
    fontFamily: "M PLUS Rounded 1c",
  },
  content: { padding: 20, gap: 20 },
  recipeHeader: {
    marginBottom: 4,
  },
  recipe: {
    fontSize: 24,
    fontWeight: "800",
    color: theme.colors.text,
    fontFamily: "M PLUS Rounded 1c",
    marginBottom: 8,
  },
  meta: {
    color: theme.colors.subText,
    fontSize: 14,
    fontWeight: "600",
  },
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    padding: 20,
    gap: 16,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  stepHeader: {
    flexDirection: "row",
  },
  stepBadge: {
    backgroundColor: theme.colors.info,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
  },
  stepBadgeText: {
    color: theme.colors.primary,
    fontWeight: "800",
    fontSize: 14,
  },
  stepText: {
    color: theme.colors.text,
    lineHeight: 28,
    fontSize: 18,
    fontFamily: "M PLUS Rounded 1c",
  },
  countdown: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.lg,
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  countdownLabel: {
    color: "rgba(255,255,255,0.8)",
    fontWeight: "700",
    fontSize: 14,
  },
  countdownValue: {
    color: "#fff",
    fontSize: 48,
    fontWeight: "800",
    fontFamily: "Quicksand",
  },
  subTitle: {
    fontWeight: "800",
    color: theme.colors.text,
    fontSize: 18,
    fontFamily: "M PLUS Rounded 1c",
    marginBottom: 4,
  },
  ganttRow: { gap: 8, marginBottom: 8 },
  ganttLabel: { fontSize: 13, color: theme.colors.subText, fontWeight: "600" },
  activeLabel: { color: theme.colors.primary, fontWeight: "800" },
  doneLabel: { color: theme.colors.success },
  track: {
    height: 16,
    backgroundColor: theme.colors.bg,
    borderRadius: 8,
    overflow: "hidden",
    position: "relative",
  },
  bar: {
    height: "100%",
    backgroundColor: theme.colors.border,
    borderRadius: 8,
    position: "absolute",
    top: 0,
  },
  activeBar: {
    backgroundColor: theme.colors.primary,
  },
  doneBar: {
    backgroundColor: theme.colors.success,
  },
});
