import { AppButton } from '@/components/AppButton';
import { theme } from '@/constants/theme';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import { useRecipes } from '@/hooks/useRecipes';
import { multiplierForRecipe, scaleIngredient, stripHtml } from '@/utils/recipe';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView, ScrollView, StyleSheet, Text, View, Image, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getRecipeById } = useRecipes();
  const { settings } = useAppSettings();
  const insets = useSafeAreaInsets();

  const recipe = getRecipeById(String(id));
  const multiplier = multiplierForRecipe(recipe, settings.servingsPerMeal);
  const ingredients = (recipe?.ingredients ?? []).map((ing) => scaleIngredient(ing, multiplier));

  if (!recipe) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.notFound}><Text>レシピが見つかりませんでした。</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>← 戻る</Text></Pressable>
        <Text style={styles.title}>Vibe Cooking 🍳</Text>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 120 + insets.bottom }]}>
        <Text style={styles.recipeName}>{recipe.name}</Text>
        <Image source={{ uri: recipe.image_url }} style={styles.hero} resizeMode="cover" />
        <Text style={styles.description}>{recipe.description}</Text>

        <Text style={styles.section}>材料（{settings.servingsPerMeal}人前）</Text>
        <View style={styles.card}>
          {ingredients.map((item, idx) => (
            <Text key={`${idx}-${item}`} style={styles.line}>・{item}</Text>
          ))}
        </View>

        <Text style={styles.section}>作り方</Text>
        <View style={styles.card}>
          {(recipe.instruction_steps ?? []).length > 0
            ? recipe.instruction_steps?.map((step, idx) => (
                <View key={idx} style={styles.stepWrap}>
                  <Text style={styles.step}>[{idx + 1}] {stripHtml(step.text)}</Text>
                  {step.image_url ? <Image source={{ uri: step.image_url }} style={styles.stepImage} resizeMode="cover" /> : null}
                </View>
              ))
            : recipe.instructions?.map((step, idx) => (
                <Text key={idx} style={styles.step}>[{idx + 1}] {stripHtml(step)}</Text>
              ))}
        </View>
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: 12 + insets.bottom }]}> 
        <AppButton label="買い出しリストへ進む" onPress={() => router.push(`/shopping/${recipe.id}`)} />
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
  recipeName: { fontSize: 24, fontWeight: '800', color: theme.colors.text, marginBottom: 12 },
  hero: { width: '100%', height: 220, borderRadius: theme.radius.lg, marginBottom: 12 },
  description: { color: theme.colors.text, lineHeight: 22, marginBottom: 14 },
  section: { fontSize: 18, fontWeight: '700', color: theme.colors.text, marginBottom: 8 },
  card: { backgroundColor: '#fff', borderRadius: theme.radius.lg, padding: 12, marginBottom: 16, gap: 6 },
  line: { color: theme.colors.text, lineHeight: 22 },
  stepWrap: { gap: 8, marginBottom: 10 },
  step: { color: theme.colors.text, lineHeight: 22 },
  stepImage: { width: '100%', height: 170, borderRadius: theme.radius.md },
  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: theme.colors.card, borderTopWidth: 1, borderTopColor: theme.colors.border, paddingHorizontal: 16, paddingTop: 10 },
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
