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
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.back}>← レシピへ</Text>
        </Pressable>
        <Text style={styles.title}>買い出しリスト</Text>
      </View>
      
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 120 + insets.bottom }]}> 
        <View style={styles.sectionHeader}>
          <Text style={styles.recipe}>{recipe.name}</Text>
          <View style={styles.divider} />
        </View>
        
        <View style={styles.card}>
          {items.map((item, idx) => {
            const isLast = idx === items.length - 1;
            return (
              <Pressable 
                key={`${idx}-${item}`} 
                style={[styles.item, isLast && styles.itemLast]} 
                onPress={() => setChecked((p) => ({ ...p, [idx]: !p[idx] }))}
              >
                <View style={[styles.checkbox, checked[idx] && styles.checkboxChecked]}>
                  {checked[idx] && <Text style={styles.checkIcon}>✓</Text>}
                </View>
                <Text style={[styles.itemText, checked[idx] && styles.itemTextDone]}>{item}</Text>
              </Pressable>
            );
          })}
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
  content: { padding: 20 },
  sectionHeader: {
    marginBottom: 16,
  },
  recipe: { 
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
    overflow: 'hidden',
    // iOS Shadow
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    // Android Shadow
    elevation: 4,
  },
  item: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 16, 
    padding: 16, 
    borderBottomWidth: 1, 
    borderBottomColor: theme.colors.border 
  },
  itemLast: {
    borderBottomWidth: 0,
  },
  checkbox: { 
    width: 24, 
    height: 24, 
    borderWidth: 2, 
    borderColor: theme.colors.border, 
    borderRadius: 6, 
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  checkboxChecked: { 
    backgroundColor: theme.colors.primary, 
    borderColor: theme.colors.primary,
  },
  checkIcon: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
    marginTop: -2,
  },
  itemText: { 
    color: theme.colors.text, 
    flex: 1,
    fontSize: 16,
    lineHeight: 24,
  },
  itemTextDone: { 
    textDecorationLine: 'line-through', 
    color: theme.colors.subText 
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
});
