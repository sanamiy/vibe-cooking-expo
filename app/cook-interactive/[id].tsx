import prebuiltGantt from "@/data/gantt/recipes-gantt.json";
import { theme } from "@/constants/theme";
import { useAppSettings } from "@/contexts/AppSettingsContext";
import { useRecipes } from "@/hooks/useRecipes";
import { buildRecipeGantt, RecipeGanttData } from "@/utils/gantt";
import { stripHtml } from "@/utils/recipe";
import {
  scheduleMultipleRecipes,
  type SchedulerTask,
  type MultiRecipeSchedule,
} from "@/utils/scheduler";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Speech from "expo-speech";
import { useVoiceCommands, VoiceCommand } from "@/hooks/useVoiceCommands";

const makeTimerNotice = (minutes: number) =>
  `${minutes}分経過しました。次に進みますか？`;

const toSteps = (
  recipe: ReturnType<ReturnType<typeof useRecipes>["getRecipeById"]>
) => {
  if (!recipe) return [] as Array<{ text: string }>;
  if (recipe.instruction_steps?.length)
    return recipe.instruction_steps.map((s) => ({ text: s.text }));
  return (recipe.instructions ?? []).map((text) => ({ text }));
};

const formatCountdownLabel = (countdown: number | null) => {
  if (countdown === null) return "";
  const mm = String(Math.floor(countdown / 60)).padStart(2, "0");
  const ss = String(countdown % 60).padStart(2, "0");
  return `${mm}:${ss}`;
};

// ─── Single recipe mode (legacy) ───────────────────

function useSingleRecipeMode(id: string) {
  const { getRecipeById } = useRecipes();
  const recipe = getRecipeById(id);

  const steps = useMemo(() => toSteps(recipe), [recipe]);

  const gantt = useMemo<RecipeGanttData>(() => {
    const prebuilt = (
      prebuiltGantt as { recipes?: RecipeGanttData[] }
    ).recipes?.find((r) => r.recipe_id === id);
    return prebuilt ?? buildRecipeGantt(id, steps);
  }, [id, steps]);

  return { recipe, steps, gantt, recipes: recipe ? [recipe] : [] };
}

// ─── Multi recipe mode ─────────────────────────────

const EMPTY_SCHEDULE: MultiRecipeSchedule = {
  tasks: [],
  total_time: 0,
  algorithm_used: "",
};

function useMultiRecipeMode(ids: string[]) {
  const { getRecipeById } = useRecipes();
  const { settings } = useAppSettings();

  const recipes = useMemo(
    () => ids.map((i) => getRecipeById(i)).filter(Boolean),
    [ids, getRecipeById]
  );

  const [schedule, setSchedule] = useState<MultiRecipeSchedule>(EMPTY_SCHEDULE);
  const [isLoading, setIsLoading] = useState(false);

  // Stable key to avoid re-render loop (getRecipeById changes reference each render)
  const idsKey = ids.join(",");

  useEffect(() => {
    const currentRecipes = ids.map((i) => getRecipeById(i)).filter(Boolean);
    if (currentRecipes.length === 0) return;
    let cancelled = false;
    setIsLoading(true);
    scheduleMultipleRecipes(currentRecipes as any[], settings.stoveBurners)
      .then((result) => {
        if (!cancelled) setSchedule(result);
      })
      .catch((err) => {
        console.error("Scheduling failed:", err);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, settings.stoveBurners]);

  return { recipes, schedule, isLoading };
}

// ─── Main Screen ────────────────────────────────────

export default function CookInteractiveScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const ids = useMemo(() => String(id).split(","), [id]);
  const isMulti = ids.length > 1;

  // Single recipe mode
  const single = useSingleRecipeMode(ids[0]);
  // Multi recipe mode
  const multi = useMultiRecipeMode(ids);

  // Unified step list for navigation
  const scheduledTasks = useMemo<SchedulerTask[]>(() => {
    if (!isMulti) return [];
    return [...multi.schedule.tasks].sort(
      (a, b) => a.start_time - b.start_time
    );
  }, [isMulti, multi.schedule]);

  const totalSteps = isMulti ? scheduledTasks.length : single.steps.length;
  const totalTime = isMulti
    ? multi.schedule.total_time
    : single.gantt.total_estimated_minutes;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [timerNotice, setTimerNotice] = useState("");
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isVoiceActive, setIsVoiceActive] = useState(false);

  const speak = useCallback((text: string) => {
    Speech.stop();
    Speech.speak(text, { language: "ja-JP", rate: 1.1 });
  }, []);

  // Current step text
  const currentStepText = useMemo(() => {
    if (isMulti) {
      const task = scheduledTasks[currentIndex];
      if (!task) return "手順がありません";
      const prefix =
        task.task_type === "wash" ? "" : `【${task.recipe_name}】`;
      return `${prefix}${task.step_description}`;
    }
    const step = single.steps[currentIndex];
    return step ? stripHtml(step.text) : "手順がありません";
  }, [isMulti, currentIndex, scheduledTasks, single.steps]);

  // Read out current step
  useEffect(() => {
    if (currentStepText) {
      speak(`ステップ${currentIndex + 1}。${stripHtml(currentStepText)}`);
    }
    return () => {
      Speech.stop();
    };
  }, [currentIndex, currentStepText, speak]);

  const handleVoiceCommand = useCallback(
    (command: VoiceCommand) => {
      if (command === "NEXT") {
        setCurrentIndex((p) => Math.min(totalSteps - 1, p + 1));
      } else if (command === "PREVIOUS") {
        setCurrentIndex((p) => Math.max(0, p - 1));
      } else if (command === "REPEAT") {
        speak(`もう一度読み上げます。ステップ${currentIndex + 1}。${stripHtml(currentStepText)}`);
      }
    },
    [totalSteps, currentIndex, currentStepText, speak]
  );

  const { isListening, error } = useVoiceCommands({
    onCommand: handleVoiceCommand,
    active: isVoiceActive,
  });

  // Timer logic
  useEffect(() => {
    setTimerNotice("");
    let timerMinutes: number | null = null;

    if (isMulti) {
      // Multi mode: no auto-timer (duration is already scheduled)
      setCountdown(null);
      return;
    }

    const task = single.gantt.tasks[currentIndex];
    if (!task?.requires_timer || !task.timer_minutes) {
      setCountdown(null);
      return;
    }
    timerMinutes = task.timer_minutes;

    let remaining = timerMinutes * 60;
    setCountdown(remaining);

    const interval = setInterval(() => {
      remaining -= 1;
      setCountdown(Math.max(0, remaining));
      if (remaining <= 0) {
        const notice = makeTimerNotice(timerMinutes!);
        setTimerNotice(notice);
        speak(notice);
      }
    }, 1000);

    const timeout = setTimeout(() => {
      const notice = makeTimerNotice(timerMinutes!);
      setTimerNotice(notice);
      setCountdown(0);
      speak(notice);
    }, timerMinutes * 60 * 1000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [currentIndex, isMulti, single.gantt.tasks, speak]);

  const displayRecipes = isMulti ? multi.recipes : single.recipes;
  if (displayRecipes.length === 0) return <SafeAreaView style={styles.safeArea} />;

  if (isMulti && multi.isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.back}>← 買い出しへ</Text>
          </Pressable>
          <Text style={styles.title}>調理ナビ</Text>
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Claudeがレシピを分析中...</Text>
          <Text style={styles.loadingSubText}>
            各工程のリソース要件を判定しています
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const countdownLabel = formatCountdownLabel(countdown);

  // Badge label
  const currentTask = isMulti ? scheduledTasks[currentIndex] : null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.back}>← 買い出しへ</Text>
        </Pressable>
        <Text style={styles.title}>調理ナビ</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.recipeHeader}>
          <Text style={styles.recipe}>
            {displayRecipes.map((r) => r?.name).join(" × ")}
          </Text>
          <Text style={styles.meta}>
            ⏱ 推定 {totalTime}分 / ステップ {totalSteps}
            {isMulti ? ` (${multi.schedule.algorithm_used})` : ""}
          </Text>
        </View>

        {/* Current step card */}
        <View style={styles.card}>
          <View style={styles.stepHeader}>
            <View style={styles.stepBadge}>
              <Text style={styles.stepBadgeText}>
                STEP {currentIndex + 1} / {totalSteps}
              </Text>
            </View>
            {currentTask && (
              <View
                style={[
                  styles.recipeBadge,
                  { backgroundColor: currentTask.color },
                ]}
              >
                <Text style={styles.recipeBadgeText}>
                  {currentTask.task_type === "wash"
                    ? "洗い物"
                    : currentTask.recipe_name}
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.stepText}>{stripHtml(currentStepText)}</Text>
          {currentTask && (
            <View style={styles.taskMeta}>
              <Text style={styles.taskMetaText}>
                {currentTask.start_time}分〜
                {currentTask.start_time + currentTask.duration}分
                {currentTask.uses_stove ? " 🔥コンロ" : ""}
                {!currentTask.requires_attention ? " ⏳放置OK" : ""}
              </Text>
            </View>
          )}
        </View>

        {timerNotice ? (
          <View style={styles.timerNotice}>
            <Text style={styles.timerNoticeIcon}>⏰</Text>
            <Text style={styles.timerNoticeText}>{timerNotice}</Text>
          </View>
        ) : null}

        {countdownLabel ? (
          <View style={styles.countdown}>
            <Text style={styles.countdownLabel}>タイマー</Text>
            <Text style={styles.countdownValue}>{countdownLabel}</Text>
          </View>
        ) : null}

        {/* Gantt chart */}
        <View style={styles.card}>
          <Text style={styles.subTitle}>
            {isMulti ? "スケジュール" : "工程ガントチャート"}
          </Text>
          {isMulti
            ? renderMultiGantt(scheduledTasks, totalTime, currentIndex)
            : single.gantt.tasks.map((task) => {
                const total = Math.max(1, single.gantt.total_estimated_minutes);
                const left = `${(task.start_min / total) * 100}%`;
                const width = `${Math.max(
                  8,
                  (task.duration_min / total) * 100
                )}%`;
                return (
                  <View key={task.task_id} style={styles.ganttRow}>
                    <Text
                      style={[
                        styles.ganttLabel,
                        task.step_index - 1 === currentIndex && styles.active,
                      ]}
                    >
                      {task.step_index}. {task.label}
                    </Text>
                    <View style={styles.track}>
                      <View
                        style={[
                          styles.bar,
                          { left: left as any, width: width as any },
                        ]}
                      />
                    </View>
                  </View>
                );
              })}
        </View>

        {/* Voice navigation */}
        <View style={styles.card}>
          <View style={styles.voiceHeader}>
            <Text style={styles.subTitle}>音声ナビゲーション</Text>
            <Pressable
              style={[
                styles.voiceToggleBtn,
                isVoiceActive && styles.voiceToggleActive,
              ]}
              onPress={() => setIsVoiceActive(!isVoiceActive)}
            >
              <Text
                style={[
                  styles.voiceToggleText,
                  isVoiceActive && styles.voiceToggleTextActive,
                ]}
              >
                {isVoiceActive ? "マイクON 🎤" : "マイクOFF 🔇"}
              </Text>
            </Pressable>
          </View>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {isVoiceActive && (
            <Text style={styles.voiceHelperText}>
              {isListening
                ? "🗣️ 音声コマンドを待機中..."
                : "⏳ マイクを準備中..."}
              {"\n"}「次」「戻って」「もう一回」と話しかけてください。
            </Text>
          )}

          <View style={styles.voiceRow}>
            <Pressable
              style={({ pressed }) => [
                styles.voiceBtn,
                styles.voicePrimary,
                pressed && { opacity: 0.8 },
              ]}
              onPress={() => handleVoiceCommand("NEXT")}
            >
              <Text style={styles.voicePrimaryText}>次へ</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.voiceBtn,
                pressed && { opacity: 0.8 },
              ]}
              onPress={() => handleVoiceCommand("REPEAT")}
            >
              <Text style={styles.voiceBtnText}>もう一回言って</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Multi-recipe Gantt rendering ───────────────────

function renderMultiGantt(
  tasks: SchedulerTask[],
  totalTime: number,
  currentIndex: number
) {
  const total = Math.max(1, totalTime);
  return tasks.map((task, idx) => {
    const left = `${(task.start_time / total) * 100}%`;
    const width = `${Math.max(8, (task.duration / total) * 100)}%`;
    const isCurrent = idx === currentIndex;
    const label =
      task.task_type === "wash"
        ? "🧹 洗い物"
        : `${task.recipe_name}: ${task.step_description.slice(0, 20)}`;

    return (
      <View key={`${task.recipe_id}-${task.step_index}-${idx}`} style={styles.ganttRow}>
        <Text
          style={[styles.ganttLabel, isCurrent && styles.active]}
          numberOfLines={1}
        >
          {idx + 1}. {label}
        </Text>
        <View style={styles.track}>
          <View
            style={[
              styles.bar,
              {
                left: left as any,
                width: width as any,
                backgroundColor: task.color,
              },
            ]}
          />
        </View>
      </View>
    );
  });
}

// ─── Styles ─────────────────────────────────────────

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
    gap: 8,
    flexWrap: "wrap",
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
  recipeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
  },
  recipeBadgeText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
  },
  stepText: {
    color: theme.colors.text,
    lineHeight: 28,
    fontSize: 18,
    fontFamily: "M PLUS Rounded 1c",
  },
  taskMeta: {
    backgroundColor: theme.colors.bg,
    padding: 8,
    borderRadius: theme.radius.md,
  },
  taskMetaText: {
    color: theme.colors.subText,
    fontSize: 13,
    fontWeight: "600",
  },
  timerNotice: {
    backgroundColor: "#FFF1E9",
    borderColor: "#FFBF9E",
    borderWidth: 1,
    padding: 16,
    borderRadius: theme.radius.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  timerNoticeIcon: {
    fontSize: 24,
  },
  timerNoticeText: {
    color: "#8A3D1E",
    fontWeight: "700",
    flex: 1,
    lineHeight: 22,
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
  voiceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  voiceToggleBtn: {
    backgroundColor: theme.colors.bg,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  voiceToggleActive: {
    backgroundColor: "#EAF6FF",
    borderColor: theme.colors.blue,
  },
  voiceToggleText: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.subText,
  },
  voiceToggleTextActive: {
    color: theme.colors.blue,
  },
  voiceHelperText: {
    fontSize: 13,
    color: theme.colors.subText,
    lineHeight: 20,
    backgroundColor: theme.colors.bg,
    padding: 12,
    borderRadius: theme.radius.md,
  },
  errorText: {
    color: theme.colors.primary,
    fontSize: 13,
    fontWeight: "600",
  },
  voiceRow: { flexDirection: "row", gap: 12 },
  voiceBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.bg,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  voicePrimary: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  voicePrimaryText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  voiceBtnText: { color: theme.colors.text, fontWeight: "700", fontSize: 14 },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 40,
  },
  loadingText: {
    fontSize: 20,
    fontWeight: "800",
    color: theme.colors.primary,
    fontFamily: "M PLUS Rounded 1c",
  },
  loadingSubText: {
    fontSize: 14,
    color: theme.colors.subText,
    textAlign: "center",
  },
  ganttRow: { gap: 8, marginBottom: 8 },
  ganttLabel: { fontSize: 13, color: theme.colors.subText, fontWeight: "600" },
  active: { color: theme.colors.primary, fontWeight: "800" },
  track: {
    height: 16,
    backgroundColor: theme.colors.bg,
    borderRadius: 8,
    overflow: "hidden",
    position: "relative",
  },
  bar: {
    height: "100%",
    backgroundColor: theme.colors.primary,
    borderRadius: 8,
    position: "absolute",
    top: 0,
  },
});
