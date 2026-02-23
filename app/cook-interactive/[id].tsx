import prebuiltGantt from '@/data/gantt/recipes-gantt.json';
import { theme } from '@/constants/theme';
import { useRecipes } from '@/hooks/useRecipes';
import { buildRecipeGantt, RecipeGanttData } from '@/utils/gantt';
import { stripHtml } from '@/utils/recipe';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

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
        setTimerNotice(`${task.timer_minutes}分経過しました。次に進みますか？`);
      }
    }, 1000);

    const timeout = setTimeout(() => {
      setTimerNotice(`${task.timer_minutes}分経過しました。次に進みますか？`);
      setCountdown(0);
    }, task.timer_minutes * 60 * 1000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [currentIndex, gantt.tasks]);

  if (!recipe) return <SafeAreaView style={styles.safeArea} />;

  const currentStep = steps[currentIndex];
  const countdownLabel = countdown === null ? '' : `${String(Math.floor(countdown / 60)).padStart(2, '0')}:${String(countdown % 60).padStart(2, '0')}`;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}><Pressable onPress={() => router.back()}><Text style={styles.back}>← 買い出しへ戻る</Text></Pressable><Text style={styles.title}>調理ナビ</Text></View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.recipe}>{recipe.name}</Text>
        <Text style={styles.meta}>推定 {gantt.total_estimated_minutes}分 / ステップ {steps.length}</Text>

        <View style={styles.card}>
          <Text style={styles.stepChip}>STEP {currentIndex + 1} / {steps.length}</Text>
          <Text style={styles.stepText}>{stripHtml(currentStep?.text ?? '手順がありません')}</Text>
        </View>

        {timerNotice ? <View style={styles.timer}><Text style={styles.timerText}>⏰ {timerNotice}</Text></View> : null}
        {countdownLabel ? <View style={styles.countdown}><Text>タイマー: {countdownLabel}</Text></View> : null}

        <View style={styles.card}>
          <Text style={styles.subTitle}>音声入力（仮）</Text>
          <View style={styles.voiceRow}>
            <Pressable style={[styles.voiceBtn, styles.voicePrimary]} onPress={() => setCurrentIndex((p) => Math.min(steps.length - 1, p + 1))}><Text style={styles.voicePrimaryText}>できたよ〜</Text></Pressable>
            <Pressable style={styles.voiceBtn}><Text>もう一回言って</Text></Pressable>
          </View>
        </View>

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
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.bg },
  header: { padding: 16, borderBottomWidth: 1, borderBottomColor: theme.colors.border, backgroundColor: theme.colors.card },
  back: { color: theme.colors.subText, fontWeight: '700', marginBottom: 4 },
  title: { color: theme.colors.primary, fontWeight: '800', fontSize: 22 },
  content: { padding: 16, gap: 12 },
  recipe: { fontSize: 22, fontWeight: '700', color: theme.colors.text },
  meta: { color: theme.colors.subText },
  card: { backgroundColor: '#fff', borderRadius: theme.radius.lg, padding: 12, gap: 8 },
  stepChip: { color: theme.colors.primary, fontWeight: '700' },
  stepText: { color: theme.colors.text, lineHeight: 22 },
  timer: { backgroundColor: '#FFF1E9', borderColor: '#FFBF9E', borderWidth: 1, padding: 10, borderRadius: theme.radius.md },
  timerText: { color: '#8A3D1E', fontWeight: '700' },
  countdown: { backgroundColor: theme.colors.info, borderRadius: theme.radius.md, padding: 10 },
  subTitle: { fontWeight: '700', color: theme.colors.text },
  voiceRow: { flexDirection: 'row', gap: 8 },
  voiceBtn: { minHeight: 44, borderRadius: theme.radius.md, backgroundColor: '#EFE8DF', paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  voicePrimary: { backgroundColor: theme.colors.primary },
  voicePrimaryText: { color: '#fff', fontWeight: '700' },
  ganttRow: { gap: 6 },
  ganttLabel: { fontSize: 12, color: theme.colors.subText },
  active: { color: theme.colors.primary, fontWeight: '700' },
  track: { height: 20, backgroundColor: '#F2EDE7', borderRadius: 999, overflow: 'hidden', position: 'relative' },
  bar: { height: '100%', backgroundColor: theme.colors.primary, borderRadius: 999, position: 'absolute', top: 0 },
});
