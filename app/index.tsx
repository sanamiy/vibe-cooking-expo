import { AppButton } from '@/components/AppButton';
import { RecipeCard } from '@/components/RecipeCard';
import { theme } from '@/constants/theme';
import { useRecipes } from '@/hooks/useRecipes';
import { MAX_SELECTION } from '@/utils/recipe';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function HomeScreen() {
  const { recipes } = useRecipes();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const insets = useSafeAreaInsets();

  const selectedCount = selectedIds.length;
  const selectedLabel = useMemo(() => `${selectedCount} / ${MAX_SELECTION}`, [selectedCount]);

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((v) => v !== id);
      if (prev.length >= MAX_SELECTION) {
        Alert.alert(`最大${MAX_SELECTION}個まで選択できます`);
        return prev;
      }
      return [...prev, id];
    });
  };

  const onConfirm = () => {
    if (selectedCount === 1) {
      router.push(`/recipe/${selectedIds[0]}`);
      return;
    }
    Alert.alert('複数料理は後日対応', `${selectedCount}件を選択中です。まずは1件選択で進んでください。`);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.title}>Vibe Cooking 🍳</Text>
        <Text style={styles.subtitle}>気になる料理を選んで、今日のメニューを決めよう</Text>
        <Pressable style={styles.settingsBtn} onPress={() => router.push('/settings')}>
          <Text style={styles.settingsText}>⚙️</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: selectedCount > 0 ? 120 + insets.bottom : 24 }]}>
        <View style={styles.row}>
          <Text style={styles.sectionTitle}>献立を決める</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{selectedLabel}</Text>
          </View>
        </View>
        <Text style={styles.help}>1〜5個の料理を選択してください</Text>

        {recipes.map((recipe) => (
          <RecipeCard key={recipe.id} recipe={recipe} isSelected={selectedIds.includes(recipe.id)} onToggle={toggle} />
        ))}
      </ScrollView>

      {selectedCount > 0 ? (
        <View style={[styles.bottomBar, { paddingBottom: 12 + insets.bottom }]}>
          <View style={styles.bottomRow}>
            <Text style={styles.bottomInfo}>{selectedCount}個の料理を選択中</Text>
            <AppButton label="決定する" onPress={onConfirm} />
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.bg },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.card,
  },
  title: { fontSize: 28, fontWeight: '800', color: theme.colors.primary },
  subtitle: { marginTop: 4, color: theme.colors.subText, fontSize: 13 },
  settingsBtn: { position: 'absolute', right: 16, top: 16, padding: 8 },
  settingsText: { fontSize: 24 },
  content: { padding: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 20, fontWeight: '700', color: theme.colors.text },
  badge: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.pill,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  badgeText: { fontWeight: '700', color: theme.colors.text },
  help: { color: theme.colors.subText, marginVertical: 10 },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colors.card,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  bottomRow: { gap: 10 },
  bottomInfo: { color: theme.colors.text, fontWeight: '600' },
});
