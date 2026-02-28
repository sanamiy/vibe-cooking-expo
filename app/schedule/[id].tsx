import { AppButton } from '@/components/AppButton';
import { theme } from '@/constants/theme';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import { useRecipes } from '@/hooks/useRecipes';
import {
  RECIPE_COLORS,
  scheduleMultipleRecipes,
  type MultiRecipeSchedule,
  type SchedulerTask,
} from '@/utils/scheduler';
import { setScheduleTips } from '@/utils/scheduleStore';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ScheduleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getRecipeById } = useRecipes();
  const { settings } = useAppSettings();
  const insets = useSafeAreaInsets();

  const ids = useMemo(() => String(id).split(','), [id]);
  const recipes = useMemo(
    () => ids.map((i) => getRecipeById(i)).filter(Boolean) as NonNullable<ReturnType<ReturnType<typeof useRecipes>['getRecipeById']>>[],
    [ids, getRecipeById],
  );

  const [schedule, setSchedule] = useState<MultiRecipeSchedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (recipes.length === 0) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const result = await scheduleMultipleRecipes(recipes, settings.stoveBurners);
        if (!cancelled) {
          // Store per-step tips for each recipe so cook-interactive can use them
          for (const rid of ids) {
            const recipeTasks = result.tasks
              .filter((t) => t.recipe_id === rid)
              .sort((a, b) => a.step_index - b.step_index);
            setScheduleTips(rid, recipeTasks.map((t) => t.tips));
          }
          setSchedule(result);
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'スケジュール作成に失敗しました');
          setLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [recipes, settings.stoveBurners]);

  // レシピ名 → 色のマップ
  const recipeColorMap = useMemo(() => {
    const map = new Map<string, { color: string; name: string }>();
    recipes.forEach((r, idx) => {
      map.set(r.id, { color: RECIPE_COLORS[idx % RECIPE_COLORS.length], name: r.name });
    });
    return map;
  }, [recipes]);

  if (recipes.length === 0) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.notFound}>
          <Text>レシピが見つかりませんでした。</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.back}>← 買い出しリスト</Text>
        </Pressable>
        <Text style={styles.title}>スケジュール</Text>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 120 + insets.bottom }]}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={styles.loadingText}>スケジュールを作成中...</Text>
            <Text style={styles.loadingSubText}>
              レシピの工程を分析しています
            </Text>
          </View>
        ) : error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
            <AppButton
              label="再試行"
              variant="outline"
              onPress={() => {
                setError(null);
                setLoading(true);
              }}
            />
          </View>
        ) : schedule ? (
          <>
            {/* サマリー */}
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>調理プラン</Text>
              <View style={styles.summaryRow}>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryValue}>{schedule.total_time}</Text>
                  <Text style={styles.summaryLabel}>合計（分）</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryValue}>{recipes.length}</Text>
                  <Text style={styles.summaryLabel}>レシピ数</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryValue}>{settings.stoveBurners}</Text>
                  <Text style={styles.summaryLabel}>コンロ口数</Text>
                </View>
              </View>
            </View>

            {/* レシピ凡例 */}
            <View style={styles.legendCard}>
              {recipes.map((r, idx) => (
                <View key={r.id} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: RECIPE_COLORS[idx % RECIPE_COLORS.length] }]} />
                  <Text style={styles.legendText}>{r.name}</Text>
                </View>
              ))}
            </View>

            {/* タイムラインガントチャート */}
            <View style={styles.card}>
              <Text style={styles.subTitle}>タイムライン</Text>
              <GanttChart tasks={schedule.tasks} totalTime={schedule.total_time} />
            </View>

            {/* タスク一覧 */}
            <View style={styles.card}>
              <Text style={styles.subTitle}>工程一覧（時系列順）</Text>
              {schedule.tasks
                .slice()
                .sort((a, b) => a.start_time - b.start_time)
                .map((task, idx) => (
                  <TaskRow key={idx} task={task} index={idx} />
                ))}
            </View>
          </>
        ) : null}
      </ScrollView>

      {schedule && !loading && (
        <View style={[styles.bottomBar, { paddingBottom: 12 + insets.bottom }]}>
          <AppButton
            label="調理を開始する"
            onPress={() => router.push(`/cook-interactive/${ids.join(',')}`)}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

/* ─── ガントチャート ─────────────────────────── */

function GanttChart({ tasks, totalTime }: { tasks: SchedulerTask[]; totalTime: number }) {
  if (totalTime === 0) return null;

  // 5分刻みの目盛り
  const tickInterval = totalTime <= 30 ? 5 : totalTime <= 60 ? 10 : 15;
  const ticks: number[] = [];
  for (let t = 0; t <= totalTime; t += tickInterval) {
    ticks.push(t);
  }

  return (
    <View>
      {/* 目盛り */}
      <View style={ganttStyles.tickRow}>
        {ticks.map((t) => (
          <Text
            key={t}
            style={[ganttStyles.tickLabel, { left: `${(t / totalTime) * 100}%` as any }]}
          >
            {t}分
          </Text>
        ))}
      </View>

      {/* タスクバー */}
      {tasks
        .slice()
        .sort((a, b) => a.start_time - b.start_time)
        .map((task, idx) => {
          const leftPct = (task.start_time / totalTime) * 100;
          const widthPct = Math.max(2, (task.duration / totalTime) * 100);
          const isWash = task.task_type === 'wash';

          return (
            <View key={idx} style={ganttStyles.row}>
              <View style={ganttStyles.track}>
                <View
                  style={[
                    ganttStyles.bar,
                    {
                      left: `${leftPct}%` as any,
                      width: `${widthPct}%` as any,
                      backgroundColor: isWash ? theme.colors.border : task.color,
                    },
                    isWash && ganttStyles.washBar,
                  ]}
                />
              </View>
              <Text style={ganttStyles.label} numberOfLines={1}>
                {isWash ? '🧼' : ''} {task.step_description}
              </Text>
            </View>
          );
        })}
    </View>
  );
}

/* ─── タスク行 ─────────────────────────────── */

function TaskRow({ task, index }: { task: SchedulerTask; index: number }) {
  const isWash = task.task_type === 'wash';
  const endTime = task.start_time + task.duration;

  return (
    <View style={[taskStyles.row, isWash && taskStyles.washRow]}>
      <View style={taskStyles.timeCol}>
        <Text style={taskStyles.time}>
          {task.start_time}〜{endTime}分
        </Text>
      </View>
      <View style={[taskStyles.colorBar, { backgroundColor: isWash ? theme.colors.border : task.color }]} />
      <View style={taskStyles.descCol}>
        <Text style={taskStyles.recipeName}>{task.recipe_name}</Text>
        <Text style={taskStyles.desc}>
          {isWash ? '🧼 ' : ''}
          {task.step_description}
        </Text>
        <View style={taskStyles.tags}>
          {task.uses_stove && (
            <View style={[taskStyles.tag, taskStyles.stoveTag]}>
              <Text style={taskStyles.tagText}>コンロ</Text>
            </View>
          )}
          {task.uses_cutting_board && (
            <View style={[taskStyles.tag, taskStyles.boardTag]}>
              <Text style={taskStyles.tagText}>まな板</Text>
            </View>
          )}
          {!task.requires_attention && (
            <View style={[taskStyles.tag, taskStyles.passiveTag]}>
              <Text style={taskStyles.tagText}>放置OK</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

/* ─── Styles ─────────────────────────────── */

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
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Loading
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    gap: 16,
  },
  loadingText: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
    fontFamily: 'M PLUS Rounded 1c',
  },
  loadingSubText: {
    fontSize: 14,
    color: theme.colors.subText,
  },

  // Error
  errorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    gap: 16,
  },
  errorText: {
    fontSize: 16,
    color: theme.colors.primary,
    textAlign: 'center',
  },

  // Summary
  summaryCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  summaryTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: theme.colors.text,
    fontFamily: 'M PLUS Rounded 1c',
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  summaryItem: {
    alignItems: 'center',
    gap: 4,
  },
  summaryValue: {
    fontSize: 32,
    fontWeight: '800',
    color: theme.colors.primary,
    fontFamily: 'Quicksand',
  },
  summaryLabel: {
    fontSize: 13,
    color: theme.colors.subText,
    fontWeight: '600',
  },

  // Legend
  legendCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    padding: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
  },

  // Card
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    padding: 20,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  subTitle: {
    fontWeight: '800',
    color: theme.colors.text,
    fontSize: 18,
    fontFamily: 'M PLUS Rounded 1c',
  },

  // Bottom bar
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colors.card,
    paddingHorizontal: 20,
    paddingTop: 16,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 8,
  },
});

const ganttStyles = StyleSheet.create({
  tickRow: {
    height: 24,
    position: 'relative',
    marginBottom: 8,
  },
  tickLabel: {
    position: 'absolute',
    fontSize: 11,
    color: theme.colors.subText,
    fontWeight: '600',
  },
  row: {
    marginBottom: 6,
  },
  track: {
    height: 20,
    backgroundColor: theme.colors.bg,
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
  },
  bar: {
    height: '100%',
    borderRadius: 10,
    position: 'absolute',
    top: 0,
  },
  washBar: {
    borderWidth: 1,
    borderColor: theme.colors.subText,
    borderStyle: 'dashed',
  },
  label: {
    fontSize: 11,
    color: theme.colors.subText,
    marginTop: 2,
  },
});

const taskStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  washRow: {
    opacity: 0.7,
  },
  timeCol: {
    width: 70,
    justifyContent: 'center',
  },
  time: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.subText,
  },
  colorBar: {
    width: 4,
    borderRadius: 2,
  },
  descCol: {
    flex: 1,
    gap: 4,
  },
  recipeName: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.colors.subText,
  },
  desc: {
    fontSize: 15,
    color: theme.colors.text,
    lineHeight: 22,
  },
  tags: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: theme.radius.pill,
  },
  tagText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  stoveTag: {
    backgroundColor: theme.colors.primary,
  },
  boardTag: {
    backgroundColor: theme.colors.secondary,
  },
  passiveTag: {
    backgroundColor: theme.colors.success,
  },
});
