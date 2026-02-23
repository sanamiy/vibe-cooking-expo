import { AppButton } from '@/components/AppButton';
import { theme } from '@/constants/theme';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import { useRecipes } from '@/hooks/useRecipes';
import { multiplierForRecipe, scaleIngredient } from '@/utils/recipe';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ShoppingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getRecipeById } = useRecipes();
  const { settings } = useAppSettings();
  const insets = useSafeAreaInsets();

  const recipe = getRecipeById(String(id));
  const multiplier = multiplierForRecipe(recipe, settings.servingsPerMeal);
  const items = useMemo(() => (recipe?.ingredients ?? []).map((ing) => scaleIngredient(ing, multiplier)), [recipe, multiplier]);
  const [checked, setChecked] = useState<Record<number, boolean>>({});

  if (!recipe) return <SafeAreaView style={styles.safeArea} />;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}><Pressable onPress={() => router.back()}><Text style={styles.back}>← レシピへ戻る</Text></Pressable><Text style={styles.title}>買い出しリスト</Text></View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 120 + insets.bottom }]}> 
        <Text style={styles.recipe}>{recipe.name}</Text>
        <View style={styles.list}>
          {items.map((item, idx) => (
            <Pressable key={`${idx}-${item}`} style={styles.item} onPress={() => setChecked((p) => ({ ...p, [idx]: !p[idx] }))}>
              <Text style={[styles.mark, checked[idx] && styles.markChecked]}>{checked[idx] ? '✓' : ''}</Text>
              <Text style={[styles.itemText, checked[idx] && styles.itemTextDone]}>{item}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
      <View style={[styles.bottomBar, { paddingBottom: 12 + insets.bottom }]}>
        <AppButton label="調理に進む" onPress={() => router.push(`/cook-interactive/${recipe.id}`)} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.bg },
  header: { padding: 16, borderBottomWidth: 1, borderBottomColor: theme.colors.border, backgroundColor: theme.colors.card },
  back: { color: theme.colors.subText, fontWeight: '700', marginBottom: 4 },
  title: { color: theme.colors.primary, fontWeight: '800', fontSize: 22 },
  content: { padding: 16 },
  recipe: { fontSize: 20, fontWeight: '700', marginBottom: 12, color: theme.colors.text },
  list: { backgroundColor: '#fff', borderRadius: theme.radius.lg },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  mark: { width: 24, height: 24, borderWidth: 2, borderColor: theme.colors.border, borderRadius: 6, textAlign: 'center', lineHeight: 20, color: '#fff', backgroundColor: '#fff' },
  markChecked: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  itemText: { color: theme.colors.text, flex: 1 },
  itemTextDone: { textDecorationLine: 'line-through', color: theme.colors.subText },
  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: theme.colors.card, borderTopWidth: 1, borderTopColor: theme.colors.border, paddingHorizontal: 16, paddingTop: 10 },
});
