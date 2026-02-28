import { AppButton } from '@/components/AppButton';
import { theme } from '@/constants/theme';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import { useRecipes } from '@/hooks/useRecipes';
import { multiplierForRecipe, scaleIngredient, stripHtml } from '@/utils/recipe';
import { RECIPE_COLORS } from '@/utils/scheduler';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, View, Image, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getRecipeById } = useRecipes();
  const { settings } = useAppSettings();
  const insets = useSafeAreaInsets();

  const ids = useMemo(() => String(id).split(','), [id]);
  const recipes = useMemo(() => ids.map((i) => getRecipeById(i)).filter(Boolean), [ids, getRecipeById]);
  const isMulti = recipes.length > 1;

  if (recipes.length === 0) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.notFound}><Text>レシピが見つかりませんでした。</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}><Text style={styles.back}>← 戻る</Text></Pressable>
        <Text style={styles.title}>Vibe Cooking 🍳</Text>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 120 + insets.bottom }]}>
        {recipes.map((recipe, rIdx) => {
          if (!recipe) return null;
          const multiplier = multiplierForRecipe(recipe, settings.servingsPerMeal);
          const ingredients = (recipe.ingredients ?? []).map((ing) => scaleIngredient(ing, multiplier));
          const color = RECIPE_COLORS[rIdx % RECIPE_COLORS.length];

          return (
            <View key={recipe.id}>
              {isMulti && (
                <View style={[styles.recipeLabel, { backgroundColor: color }]}>
                  <Text style={styles.recipeLabelText}>レシピ {rIdx + 1}</Text>
                </View>
              )}

              <Text style={styles.recipeName}>{recipe.name}</Text>
              <Image source={{ uri: recipe.image_url }} style={styles.hero} resizeMode="cover" />
              <Text style={styles.description}>{recipe.description}</Text>

              <View style={styles.sectionHeader}>
                <Text style={styles.section}>材料（{settings.servingsPerMeal}人前）</Text>
                <View style={styles.divider} />
              </View>
              <View style={styles.card}>
                {ingredients.map((item, idx) => (
                  <View key={`${idx}-${item}`} style={styles.ingredientRow}>
                    <View style={[styles.bullet, isMulti && { backgroundColor: color }]} />
                    <Text style={styles.line}>{item}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.sectionHeader}>
                <Text style={styles.section}>作り方</Text>
                <View style={styles.divider} />
              </View>
              <View style={styles.card}>
                {(recipe.instruction_steps ?? []).length > 0
                  ? recipe.instruction_steps?.map((step, idx) => (
                      <View key={idx} style={styles.stepWrap}>
                        <View style={[styles.stepNumberBadge, isMulti && { backgroundColor: color }]}>
                          <Text style={[styles.stepNumber, isMulti && { color: '#fff' }]}>{idx + 1}</Text>
                        </View>
                        <View style={styles.stepContent}>
                          <Text style={styles.step}>{stripHtml(step.text)}</Text>
                          {step.image_url ? <Image source={{ uri: step.image_url }} style={styles.stepImage} resizeMode="cover" /> : null}
                        </View>
                      </View>
                    ))
                  : recipe.instructions?.map((step, idx) => (
                      <View key={idx} style={styles.stepWrap}>
                        <View style={[styles.stepNumberBadge, isMulti && { backgroundColor: color }]}>
                          <Text style={[styles.stepNumber, isMulti && { color: '#fff' }]}>{idx + 1}</Text>
                        </View>
                        <View style={styles.stepContent}>
                          <Text style={styles.step}>{stripHtml(step)}</Text>
                        </View>
                      </View>
                    ))}
              </View>
            </View>
          );
        })}
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: 12 + insets.bottom }]}>
        <AppButton label="買い出しリストへ進む" onPress={() => router.push(`/shopping/${ids.join(',')}`)} />
      </View>
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
    fontSize: 16,
  },
  title: {
    color: theme.colors.primary,
    fontWeight: '800',
    fontSize: 22,
    fontFamily: 'Quicksand',
  },
  content: { padding: 20 },
  recipeLabel: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: theme.radius.pill,
    marginBottom: 12,
  },
  recipeLabelText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
  },
  recipeName: {
    fontSize: 28,
    fontWeight: '800',
    color: theme.colors.text,
    marginBottom: 16,
    fontFamily: 'M PLUS Rounded 1c',
  },
  hero: {
    width: '100%',
    height: 240,
    borderRadius: theme.radius.lg,
    marginBottom: 16
  },
  description: {
    color: theme.colors.text,
    lineHeight: 24,
    marginBottom: 24,
    fontSize: 16,
  },
  sectionHeader: {
    marginBottom: 16,
  },
  section: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.text,
    fontFamily: 'M PLUS Rounded 1c',
    marginBottom: 8,
  },
  divider: {
    height: 3,
    backgroundColor: theme.colors.divider,
    width: 40,
    borderRadius: 2,
  },
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    padding: 20,
    marginBottom: 32,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.secondary,
    marginRight: 12,
  },
  line: {
    color: theme.colors.text,
    lineHeight: 24,
    fontSize: 16,
    flex: 1,
  },
  stepWrap: {
    flexDirection: 'row',
    marginBottom: 20,
    gap: 16,
  },
  stepNumberBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  stepNumber: {
    color: theme.colors.text,
    fontWeight: '800',
    fontSize: 14,
  },
  stepContent: {
    flex: 1,
  },
  step: {
    color: theme.colors.text,
    lineHeight: 24,
    fontSize: 16,
    marginBottom: 8,
  },
  stepImage: {
    width: '100%',
    height: 200,
    borderRadius: theme.radius.md,
    marginTop: 8,
  },
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
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
