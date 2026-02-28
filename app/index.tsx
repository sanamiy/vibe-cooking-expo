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
    router.push(`/recipe/${selectedIds.join(',')}`);
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
        <View style={styles.sectionHeader}>
          <View style={styles.row}>
            <Text style={styles.sectionTitle}>献立を決める</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{selectedLabel}</Text>
            </View>
          </View>
          <View style={styles.divider} />
        </View>
        <Text style={styles.help}>1〜5個の料理を選択してください</Text>

        <View style={styles.cardContainer}>
          {recipes.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} isSelected={selectedIds.includes(recipe.id)} onToggle={toggle} />
          ))}
        </View>
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
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    backgroundColor: theme.colors.card,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  title: { 
    fontSize: 28, 
    fontWeight: '800', 
    color: theme.colors.primary,
    fontFamily: 'Quicksand',
  },
  subtitle: { 
    marginTop: 8, 
    color: theme.colors.subText, 
    fontSize: 14,
    lineHeight: 20,
  },
  settingsBtn: { position: 'absolute', right: 16, top: 20, padding: 8 },
  settingsText: { fontSize: 24 },
  content: { 
    padding: 20,
  },
  sectionHeader: {
    marginBottom: 8,
  },
  row: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: { 
    fontSize: 24, 
    fontWeight: '700', 
    color: theme.colors.text,
    fontFamily: 'M PLUS Rounded 1c',
  },
  divider: {
    height: 3,
    backgroundColor: theme.colors.divider,
    width: 40,
    borderRadius: 2,
  },
  badge: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.pill,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  badgeText: { 
    fontWeight: '700', 
    color: '#fff',
    fontSize: 14,
  },
  help: { 
    color: theme.colors.subText, 
    marginBottom: 24,
    fontSize: 14,
  },
  cardContainer: {
    gap: 20,
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colors.card,
    paddingHorizontal: 20,
    paddingTop: 16,
    // iOS Shadow
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    // Android Shadow
    elevation: 8,
  },
  bottomRow: { 
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bottomInfo: { 
    color: theme.colors.text, 
    fontWeight: '700',
    fontSize: 16,
  },
});
