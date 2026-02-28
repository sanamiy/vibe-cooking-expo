import prebuiltGantt from '@/data/gantt/recipes-gantt.json';
import { theme } from '@/constants/theme';
import { useRecipes } from '@/hooks/useRecipes';
import { buildRecipeGantt, RecipeGanttData } from '@/utils/gantt';
import { stripHtml } from '@/utils/recipe';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState, useCallback } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Speech from 'expo-speech';
import { useVoiceCommands, VoiceCommand } from '@/hooks/useVoiceCommands';

export default function CookInteractiveScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getRecipeById } = useRecipes();
  const recipe = getRecipeById(String(id));

  const steps = useMemo(() => {
    if (!recipe) return [] as Array<{ text: string }>;
    if (recipe.instruction_steps?.length) return recipe.instruction_steps.map((s) => ({ text: s.text }));
    return (recipe.instructions ?? []).map((text) => ({ text }));
  }, [recipe]);

  const gantt = useMemo<RecipeGanttData>(() => {
    const prebuilt = (prebuiltGantt as { recipes?: RecipeGanttData[] }).recipes?.find((r) => r.recipe_id === String(id));
    return prebuilt ?? buildRecipeGantt(String(id), steps);
  }, [id, steps]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [timerNotice, setTimerNotice] = useState('');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isVoiceActive, setIsVoiceActive] = useState(false);

  const speak = useCallback((text: string) => {
    Speech.stop(); // Stop any ongoing speech
    Speech.speak(text, { language: 'ja-JP', rate: 1.1 });
  }, []);

  // Read out the current step when it changes
  useEffect(() => {
    const currentStep = steps[currentIndex];
    if (currentStep) {
      speak(`ステップ${currentIndex + 1}。${stripHtml(currentStep.text)}`);
    }
    return () => {
      Speech.stop();
    };
  }, [currentIndex, steps, speak]);

  const handleVoiceCommand = useCallback((command: VoiceCommand) => {
    if (command === 'NEXT') {
      setCurrentIndex((p) => Math.min(steps.length - 1, p + 1));
    } else if (command === 'PREVIOUS') {
      setCurrentIndex((p) => Math.max(0, p - 1));
    } else if (command === 'REPEAT') {
      const currentStep = steps[currentIndex];
      if (currentStep) {
        speak(`もう一度読み上げます。ステップ${currentIndex + 1}。${stripHtml(currentStep.text)}`);
      }
    }
  }, [steps, currentIndex, speak]);

  const { isListening, error } = useVoiceCommands({
    onCommand: handleVoiceCommand,
    active: isVoiceActive,
  });

  useEffect(() => {
    setTimerNotice('');
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
      if (remaining <= 0) {
        const notice = `${task.timer_minutes}分経過しました。次に進みますか？`;
        setTimerNotice(notice);
        speak(notice);
      }
    }, 1000);

    const timeout = setTimeout(() => {
      const notice = `${task.timer_minutes}分経過しました。次に進みますか？`;
      setTimerNotice(notice);
      setCountdown(0);
      speak(notice);
    }, task.timer_minutes * 60 * 1000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [currentIndex, gantt.tasks, speak]);

  if (!recipe) return <SafeAreaView style={styles.safeArea} />;

  const currentStep = steps[currentIndex];
  const countdownLabel = countdown === null ? '' : `${String(Math.floor(countdown / 60)).padStart(2, '0')}:${String(countdown % 60).padStart(2, '0')}`;

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
          <Text style={styles.recipe}>{recipe.name}</Text>
          <Text style={styles.meta}>⏱ 推定 {gantt.total_estimated_minutes}分 / ステップ {steps.length}</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.stepHeader}>
            <View style={styles.stepBadge}>
              <Text style={styles.stepBadgeText}>STEP {currentIndex + 1} / {steps.length}</Text>
            </View>
          </View>
          <Text style={styles.stepText}>{stripHtml(currentStep?.text ?? '手順がありません')}</Text>
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

        <View style={styles.card}>
          <Text style={styles.subTitle}>工程ガントチャート</Text>
          {gantt.tasks.map((task) => {
            const total = Math.max(1, gantt.total_estimated_minutes);
            const left = `${(task.start_min / total) * 100}%`;
            const width = `${Math.max(8, (task.duration_min / total) * 100)}%`;
            return (
              <View key={task.task_id} style={styles.ganttRow}>
                <Text style={[styles.ganttLabel, task.step_index - 1 === currentIndex && styles.active]}>{task.step_index}. {task.label}</Text>
                <View style={styles.track}><View style={[styles.bar, { left: left as any, width: width as any }]} /></View>
              </View>
            );
          })}
        </View>

        <View style={styles.card}>
          <View style={styles.voiceHeader}>
            <Text style={styles.subTitle}>音声ナビゲーション</Text>
            <Pressable 
              style={[styles.voiceToggleBtn, isVoiceActive && styles.voiceToggleActive]} 
              onPress={() => setIsVoiceActive(!isVoiceActive)}
            >
              <Text style={[styles.voiceToggleText, isVoiceActive && styles.voiceToggleTextActive]}>
                {isVoiceActive ? 'マイクON 🎤' : 'マイクOFF 🔇'}
              </Text>
            </Pressable>
          </View>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {isVoiceActive && (
            <Text style={styles.voiceHelperText}>
              {isListening ? '🗣️ 音声コマンドを待機中...' : '⏳ マイクを準備中...'}
              {'\n'}「次」「戻って」「もう一回」と話しかけてください。
            </Text>
          )}

          <View style={styles.voiceRow}>
            <Pressable 
              style={({pressed}) => [styles.voiceBtn, styles.voicePrimary, pressed && {opacity: 0.8}]} 
              onPress={() => handleVoiceCommand('NEXT')}
            >
              <Text style={styles.voicePrimaryText}>次へ</Text>
            </Pressable>
            <Pressable 
              style={({pressed}) => [styles.voiceBtn, pressed && {opacity: 0.8}]}
              onPress={() => handleVoiceCommand('REPEAT')}
            >
              <Text style={styles.voiceBtnText}>もう一回言って</Text>
            </Pressable>
          </View>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtn: {
    position: 'absolute',
    left: 20,
    top: 20,
    zIndex: 1,
  },
  back: { 
    color: theme.colors.subText, 
    fontWeight: '700',
    fontSize: 14,
  },
  title: { 
    color: theme.colors.primary, 
    fontWeight: '800', 
    fontSize: 20,
    fontFamily: 'M PLUS Rounded 1c',
  },
  content: { padding: 20, gap: 20 },
  recipeHeader: {
    marginBottom: 4,
  },
  recipe: { 
    fontSize: 24, 
    fontWeight: '800', 
    color: theme.colors.text,
    fontFamily: 'M PLUS Rounded 1c',
    marginBottom: 8,
  },
  meta: { 
    color: theme.colors.subText,
    fontSize: 14,
    fontWeight: '600',
  },
  card: { 
    backgroundColor: theme.colors.card, 
    borderRadius: theme.radius.lg, 
    padding: 20, 
    gap: 16,
    // iOS Shadow
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    // Android Shadow
    elevation: 4,
  },
  stepHeader: {
    flexDirection: 'row',
  },
  stepBadge: { 
    backgroundColor: theme.colors.info,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
  },
  stepBadgeText: {
    color: theme.colors.primary, 
    fontWeight: '800',
    fontSize: 14,
  },
  stepText: { 
    color: theme.colors.text, 
    lineHeight: 28,
    fontSize: 18,
    fontFamily: 'M PLUS Rounded 1c',
  },
  timerNotice: { 
    backgroundColor: '#FFF1E9', 
    borderColor: '#FFBF9E', 
    borderWidth: 1, 
    padding: 16, 
    borderRadius: theme.radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  timerNoticeIcon: {
    fontSize: 24,
  },
  timerNoticeText: { 
    color: '#8A3D1E', 
    fontWeight: '700',
    flex: 1,
    lineHeight: 22,
  },
  countdown: { 
    backgroundColor: theme.colors.primary, 
    borderRadius: theme.radius.lg, 
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  countdownLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '700',
    fontSize: 14,
  },
  countdownValue: {
    color: '#fff',
    fontSize: 48,
    fontWeight: '800',
    fontFamily: 'Quicksand',
  },
  subTitle: { 
    fontWeight: '800', 
    color: theme.colors.text,
    fontSize: 18,
    fontFamily: 'M PLUS Rounded 1c',
    marginBottom: 4,
  },
  voiceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
    backgroundColor: '#EAF6FF', // Light blue background indicating active
    borderColor: theme.colors.blue,
  },
  voiceToggleText: {
    fontSize: 12,
    fontWeight: '700',
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
    fontWeight: '600',
  },
  voiceRow: { flexDirection: 'row', gap: 12 },
  voiceBtn: { 
    flex: 1,
    minHeight: 48, 
    borderRadius: theme.radius.pill, 
    backgroundColor: theme.colors.bg, 
    paddingHorizontal: 16, 
    alignItems: 'center', 
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  voicePrimary: { 
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  voicePrimaryText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  voiceBtnText: { color: theme.colors.text, fontWeight: '700', fontSize: 14 },
  ganttRow: { gap: 8, marginBottom: 8 },
  ganttLabel: { fontSize: 13, color: theme.colors.subText, fontWeight: '600' },
  active: { color: theme.colors.primary, fontWeight: '800' },
  track: { height: 16, backgroundColor: theme.colors.bg, borderRadius: 8, overflow: 'hidden', position: 'relative' },
  bar: { height: '100%', backgroundColor: theme.colors.primary, borderRadius: 8, position: 'absolute', top: 0 },
});
