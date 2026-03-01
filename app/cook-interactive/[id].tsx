import prebuiltGantt from "@/data/gantt/recipes-gantt.json";
import { theme } from "@/constants/theme";
import { useRecipes } from "@/hooks/useRecipes";
import { buildRecipeGantt, RecipeGanttData, GanttTask } from "@/utils/gantt";
import { stripHtml } from "@/utils/recipe";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useVoiceCommands } from "@/hooks/useVoiceCommands";
import type { VoiceInputMode } from "@/hooks/useVoiceCommands";
import { useVoiceDialogue } from "@/hooks/useVoiceDialogue";
import { VoiceDialoguePanel } from "@/components/VoiceDialoguePanel";
import { useAudioDevices } from "@/hooks/useAudioDevices";
import type { RecipeContext } from "@/services/ai";
import { getScheduleTips, getScheduleTasks } from "@/utils/scheduleStore";
import type { SchedulerTask } from "@/utils/scheduler";

const config = require("@/config.json") as {
  voiceInputMode?: VoiceInputMode;
  voxtralSpeechPrompt?: string;
  enableVoiceAlgorithmSelector?: boolean;
};

const ENABLE_VOICE_ALGORITHM_SELECTOR = Boolean(
  config?.enableVoiceAlgorithmSelector,
);

const formatCountdownLabel = (countdown: number | null) => {
  if (countdown === null) return "";
  const mm = String(Math.floor(countdown / 60)).padStart(2, "0");
  const ss = String(countdown % 60).padStart(2, "0");
  return `${mm}:${ss}`;
};

const getTaskTypeLabel = (taskType: string) => {
  switch (taskType) {
    case "prep":
      return "下準備";
    case "cook_active":
      return "加熱中";
    case "cook_passive":
      return "待機";
    case "wash":
      return "洗い物";
    default:
      return taskType;
  }
};

const getTaskTypeColor = (taskType: string) => {
  switch (taskType) {
    case "prep":
      return "#4ECDC4";
    case "cook_active":
      return "#FF6B6B";
    case "cook_passive":
      return "#FFE66D";
    case "wash":
      return "#95E1D3";
    default:
      return theme.colors.subText;
  }
};

interface CombinedStep {
  recipeId: string;
  recipeName: string;
  text: string;
  schedulerTask?: SchedulerTask;
  color: string;
}

const RECIPE_COLORS = ["#FF6B6B", "#4ECDC4", "#FFE66D", "#95E1D3", "#F38181"];

export default function CookInteractiveScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getRecipeById } = useRecipes();

  const ids = useMemo(() => String(id).split(","), [id]);
  const recipes = useMemo(
    () => ids.map((rid) => getRecipeById(rid)).filter(Boolean),
    [ids, getRecipeById],
  );

  // Combine all scheduled tasks from all recipes, sorted by start_time
  const allScheduledTasks = useMemo(() => {
    const tasks: SchedulerTask[] = [];
    for (const rid of ids) {
      const recipeTasks = getScheduleTasks(rid);
      tasks.push(...recipeTasks);
    }
    // Sort by start_time for proper ordering
    return tasks.sort((a, b) => a.start_time - b.start_time);
  }, [ids]);

  // Build combined steps from all recipes
  const combinedSteps = useMemo<CombinedStep[]>(() => {
    if (allScheduledTasks.length > 0) {
      // Use scheduled tasks (already sorted)
      return allScheduledTasks.map((t) => ({
        recipeId: t.recipe_id,
        recipeName: t.recipe_name,
        text: t.step_description,
        schedulerTask: t,
        color:
          t.color ||
          RECIPE_COLORS[ids.indexOf(t.recipe_id) % RECIPE_COLORS.length],
      }));
    }
    // Fallback: interleave original recipe steps
    const steps: CombinedStep[] = [];
    for (let i = 0; i < ids.length; i++) {
      const recipe = recipes.find((r) => r?.id === ids[i]);
      if (!recipe) continue;
      const recipeSteps = recipe.instruction_steps?.length
        ? recipe.instruction_steps.map((s) => s.text)
        : (recipe.instructions ?? []);
      for (const text of recipeSteps) {
        steps.push({
          recipeId: recipe.id,
          recipeName: recipe.name,
          text,
          color: RECIPE_COLORS[i % RECIPE_COLORS.length],
        });
      }
    }
    return steps;
  }, [allScheduledTasks, ids, recipes]);

  // For voice dialogue, use simple steps array
  const steps = useMemo(
    () => combinedSteps.map((s) => ({ text: s.text })),
    [combinedSteps],
  );

  // Build combined gantt chart
  const gantt = useMemo<RecipeGanttData>(() => {
    if (allScheduledTasks.length > 0) {
      // Note: scheduler duration and start_time are already in MINUTES
      const totalTime = Math.max(
        ...allScheduledTasks.map((t) => t.start_time + t.duration),
      );
      return {
        version: 1 as const,
        recipe_id: ids.join(","),
        total_estimated_minutes: totalTime,
        generation: {
          method: "llm-assisted-rule-based" as const,
          generated_at: new Date().toISOString(),
        },
        tasks: allScheduledTasks.map((t, idx) => {
          // duration and start_time are already in minutes from scheduler
          const durationMin = t.duration;
          const startMin = t.start_time;
          return {
            task_id: `${t.recipe_id}-${idx}`,
            step_index: idx + 1,
            label:
              t.step_description.slice(0, 25) +
              (t.step_description.length > 25 ? "…" : ""),
            source_text: t.step_description,
            duration_min: durationMin,
            start_min: startMin,
            end_min: startMin + durationMin,
            requires_timer: t.task_type === "cook_passive",
            timer_minutes: t.task_type === "cook_passive" ? durationMin : null,
            confidence: 1,
            depends_on: [],
          };
        }),
      };
    }
    // Fallback to first recipe's prebuilt gantt
    const prebuilt = (
      prebuiltGantt as { recipes?: RecipeGanttData[] }
    ).recipes?.find((r) => r.recipe_id === ids[0]);
    return prebuilt ?? buildRecipeGantt(ids[0], steps);
  }, [ids, steps, allScheduledTasks]);

  // Recipe context for AI (combine all recipes)
  const recipeContext = useMemo<RecipeContext | undefined>(() => {
    if (recipes.length === 0) return undefined;
    const allIngredients: string[] = [];
    const allTips: string[] = [];
    for (const recipe of recipes) {
      if (recipe?.ingredients) allIngredients.push(...recipe.ingredients);
      const tips = getScheduleTips(recipe?.id ?? "");
      if (tips.length > 0) allTips.push(...tips);
    }
    return {
      recipeName: recipes
        .map((r) => r?.name)
        .filter(Boolean)
        .join("、"),
      ingredients: allIngredients,
      allSteps: combinedSteps.map((s) => stripHtml(s.text)),
      ...(allTips.length > 0 ? { stepTips: allTips } : {}),
    };
  }, [recipes, combinedSteps]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [voiceInputMode, setVoiceInputMode] = useState<VoiceInputMode>(
    config?.voiceInputMode ?? "voxtral_speech_understanding",
  );

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
    resetFromInterrupted,
  } = useVoiceDialogue({
    steps,
    tasks: gantt.tasks,
    recipeName: recipes
      .map((r) => r?.name)
      .filter(Boolean)
      .join("、"),
    currentIndex,
    outputDeviceId: selectedOutputId,
    startBgmUri: process.env.EXPO_PUBLIC_MUSIC_LINK,
    onChangeIndex: setCurrentIndex,
    onSessionEnd: () => router.back(),
    recipeContext,
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

  const { isListening, startListening } = useVoiceCommands({
    onTranscript: handleTranscript,
    onSpeechStart: interrupt,
    onSpeechEnd: resetFromInterrupted,
    active: dialogueState !== "processing",
    inputDeviceId: selectedInputId,
    isSpeaking: dialogueState === "speaking",
    voiceInputMode,
    voxtralSpeechPrompt: config?.voxtralSpeechPrompt,
  });

  useEffect(() => {
    setListeningResume(() => {
      if (!isListening) startListening();
    });
  }, [setListeningResume, isListening, startListening]);

  // Debug: keyboard navigation (dev only)
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const w = globalThis as any;
    if (!w || typeof w.addEventListener !== "function") {
      return;
    }
    const handleKeyDown = (e: any) => {
      if (e?.key === "ArrowRight" || e?.key === "n") {
        setCurrentIndex((prev) => Math.min(prev + 1, combinedSteps.length - 1));
      } else if (e?.key === "ArrowLeft" || e?.key === "p") {
        setCurrentIndex((prev) => Math.max(prev - 1, 0));
      }
    };
    w.addEventListener("keydown", handleKeyDown);
    return () => w.removeEventListener("keydown", handleKeyDown);
  }, [combinedSteps.length]);

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

  if (recipes.length === 0) return <SafeAreaView style={styles.safeArea} />;

  const currentStep = combinedSteps[currentIndex];
  const countdownLabel = formatCountdownLabel(countdown);

  // Calculate progress percentage
  const progressPercent =
    combinedSteps.length > 0
      ? Math.round(((currentIndex + 1) / combinedSteps.length) * 100)
      : 0;

  // Calculate per-recipe progress
  const recipeProgress = useMemo(() => {
    const progress: Record<
      string,
      { done: number; total: number; name: string; color: string }
    > = {};
    for (let i = 0; i < combinedSteps.length; i++) {
      const step = combinedSteps[i];
      if (!progress[step.recipeId]) {
        progress[step.recipeId] = {
          done: 0,
          total: 0,
          name: step.recipeName,
          color: step.color,
        };
      }
      progress[step.recipeId].total += 1;
      if (i < currentIndex) {
        progress[step.recipeId].done += 1;
      } else if (i === currentIndex) {
        progress[step.recipeId].done += 0.5; // Current step is half done
      }
    }
    return Object.entries(progress).map(([id, p]) => ({
      recipeId: id,
      ...p,
      percent: Math.round((p.done / p.total) * 100),
    }));
  }, [combinedSteps, currentIndex]);

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header with prominent progress */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.back}>← 戻る</Text>
        </Pressable>
        <Text style={styles.title}>調理ナビ</Text>
      </View>

      {/* Prominent progress bar at top */}
      <View style={styles.topProgressContainer}>
        <View style={styles.topProgressInfo}>
          <Text style={styles.topProgressLabel}>
            ステップ {currentIndex + 1} / {combinedSteps.length}
          </Text>
          <Text style={styles.topProgressPercent}>{progressPercent}%</Text>
        </View>
        <View style={styles.topProgressBar}>
          <View
            style={[styles.topProgressFill, { width: `${progressPercent}%` }]}
          />
        </View>
        {recipeProgress.length > 1 && (
          <View style={styles.topRecipeProgress}>
            {recipeProgress.map((rp) => (
              <View key={rp.recipeId} style={styles.topRecipeItem}>
                <View
                  style={[styles.topRecipeDot, { backgroundColor: rp.color }]}
                />
                <Text style={styles.topRecipeName} numberOfLines={1}>
                  {rp.name}
                </Text>
                <Text style={styles.topRecipePercent}>{rp.percent}%</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Current step card */}
        <View
          style={[
            styles.card,
            { borderLeftWidth: 4, borderLeftColor: currentStep?.color },
          ]}
        >
          <View style={styles.stepHeader}>
            <View style={styles.stepBadge}>
              <Text style={styles.stepBadgeText}>
                STEP {currentIndex + 1} / {combinedSteps.length}
              </Text>
            </View>
            {currentStep?.schedulerTask?.task_type && (
              <View
                style={[
                  styles.typeBadge,
                  {
                    backgroundColor: getTaskTypeColor(
                      currentStep.schedulerTask.task_type,
                    ),
                  },
                ]}
              >
                <Text style={styles.typeBadgeText}>
                  {getTaskTypeLabel(currentStep.schedulerTask.task_type)}
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.recipeLabel}>📖 {currentStep?.recipeName}</Text>
          <Text style={styles.stepText}>
            {stripHtml(currentStep?.text ?? "手順がありません")}
          </Text>
          {currentStep?.schedulerTask?.tips && (
            <View style={styles.tipsContainer}>
              <Text style={styles.tipsLabel}>💡 コツ</Text>
              <Text style={styles.tipsText}>
                {currentStep.schedulerTask.tips}
              </Text>
            </View>
          )}
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
          showVoiceAlgorithmSelector={ENABLE_VOICE_ALGORITHM_SELECTOR}
          selectedVoiceInputMode={voiceInputMode}
          onSelectVoiceInputMode={setVoiceInputMode}
        />

        {/* Gantt chart */}
        <View style={styles.card}>
          <Text style={styles.subTitle}>工程チャート</Text>
          {gantt.tasks.map((task, idx) => {
            const total = Math.max(1, gantt.total_estimated_minutes);
            const left = `${(task.start_min / total) * 100}%`;
            const width = `${Math.max(8, (task.duration_min / total) * 100)}%`;
            const isActive = idx === currentIndex;
            const isDone = idx < currentIndex;
            const stepColor = combinedSteps[idx]?.color ?? theme.colors.border;
            return (
              <View key={task.task_id} style={styles.ganttRow}>
                <View style={styles.ganttLabelRow}>
                  <View
                    style={[
                      styles.ganttColorDot,
                      { backgroundColor: stepColor },
                    ]}
                  />
                  <Text
                    style={[
                      styles.ganttLabel,
                      isActive && styles.activeLabel,
                      isDone && styles.doneLabel,
                    ]}
                    numberOfLines={1}
                  >
                    {idx + 1}. {task.label}
                  </Text>
                </View>
                <View style={styles.track}>
                  <View
                    style={[
                      styles.bar,
                      {
                        left: left as any,
                        width: width as any,
                        backgroundColor: isDone
                          ? theme.colors.success
                          : isActive
                            ? stepColor
                            : theme.colors.border,
                      },
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
  // Top progress bar styles
  topProgressContainer: {
    backgroundColor: theme.colors.card,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  topProgressInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  topProgressLabel: {
    fontSize: 16,
    fontWeight: "800",
    color: theme.colors.text,
    fontFamily: "M PLUS Rounded 1c",
  },
  topProgressPercent: {
    fontSize: 24,
    fontWeight: "800",
    color: theme.colors.primary,
    fontFamily: "Quicksand",
  },
  topProgressBar: {
    height: 8,
    backgroundColor: theme.colors.border,
    borderRadius: 4,
    overflow: "hidden",
  },
  topProgressFill: {
    height: "100%",
    backgroundColor: theme.colors.primary,
    borderRadius: 4,
  },
  topRecipeProgress: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 10,
    gap: 12,
  },
  topRecipeItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  topRecipeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  topRecipeName: {
    fontSize: 12,
    color: theme.colors.subText,
    fontWeight: "600",
    maxWidth: 80,
  },
  topRecipePercent: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.text,
  },
  content: { padding: 20, gap: 20 },
  meta: {
    color: theme.colors.subText,
    fontSize: 14,
    fontWeight: "600",
    marginTop: 8,
  },
  progressContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  progressBar: {
    flex: 1,
    height: 12,
    backgroundColor: theme.colors.border,
    borderRadius: 6,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: theme.colors.primary,
    borderRadius: 6,
  },
  progressText: {
    color: theme.colors.primary,
    fontSize: 18,
    fontWeight: "800",
    minWidth: 50,
    textAlign: "right",
  },
  recipeProgressList: {
    marginTop: 16,
    gap: 8,
  },
  recipeProgressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  recipeColorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  recipeProgressName: {
    flex: 1,
    fontSize: 13,
    color: theme.colors.text,
    fontWeight: "600",
  },
  recipeProgressBarContainer: {
    width: 80,
  },
  recipeProgressBar: {
    height: 6,
    backgroundColor: theme.colors.border,
    borderRadius: 3,
    overflow: "hidden",
  },
  recipeProgressFill: {
    height: "100%",
    borderRadius: 3,
  },
  recipeProgressPercent: {
    fontSize: 12,
    color: theme.colors.subText,
    fontWeight: "700",
    minWidth: 35,
    textAlign: "right",
  },
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    padding: 20,
    gap: 12,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  stepHeader: {
    flexDirection: "row",
    gap: 8,
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
  typeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
  },
  typeBadgeText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 12,
  },
  recipeLabel: {
    fontSize: 14,
    color: theme.colors.subText,
    fontWeight: "700",
  },
  stepText: {
    color: theme.colors.text,
    lineHeight: 28,
    fontSize: 18,
    fontFamily: "M PLUS Rounded 1c",
  },
  tipsContainer: {
    backgroundColor: theme.colors.info,
    borderRadius: theme.radius.md,
    padding: 12,
  },
  tipsLabel: {
    color: theme.colors.primary,
    fontWeight: "700",
    fontSize: 13,
    marginBottom: 4,
  },
  tipsText: {
    color: theme.colors.text,
    fontSize: 14,
    lineHeight: 20,
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
  },
  ganttRow: { gap: 6, marginBottom: 6 },
  ganttLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  ganttColorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  ganttLabel: {
    fontSize: 12,
    color: theme.colors.subText,
    fontWeight: "600",
    flex: 1,
  },
  activeLabel: { color: theme.colors.primary, fontWeight: "800" },
  doneLabel: { color: theme.colors.success },
  track: {
    height: 14,
    backgroundColor: theme.colors.bg,
    borderRadius: 7,
    overflow: "hidden",
    position: "relative",
  },
  bar: {
    height: "100%",
    borderRadius: 7,
    position: "absolute",
    top: 0,
  },
});
