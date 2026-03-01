import { AppButton } from "@/components/AppButton";
import { BackButton } from "@/components/BackButton";
import { theme } from "@/constants/theme";
import { useAppSettings } from "@/contexts/AppSettingsContext";
import { useRecipes } from "@/hooks/useRecipes";
import { multiplierForRecipe, scaleIngredient } from "@/utils/recipe";
import { RECIPE_COLORS } from "@/utils/scheduler";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

export default function ShoppingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getRecipeById } = useRecipes();
  const { settings } = useAppSettings();
  const insets = useSafeAreaInsets();

  const ids = useMemo(() => String(id).split(","), [id]);
  const recipes = useMemo(
    () => ids.map((i) => getRecipeById(i)).filter(Boolean),
    [ids, getRecipeById],
  );
  const isMulti = recipes.length > 1;

  // レシピごとの材料リスト
  const recipeItems = useMemo(() => {
    return recipes.map((recipe) => {
      if (!recipe) return { name: "", items: [], color: "" };
      const multiplier = multiplierForRecipe(recipe, settings.servingsPerMeal);
      return {
        name: recipe.name,
        items: (recipe.ingredients ?? []).map((ing) =>
          scaleIngredient(ing, multiplier),
        ),
      };
    });
  }, [recipes, settings.servingsPerMeal]);

  const [checked, setChecked] = useState<Record<string, boolean>>({});

  if (recipes.length === 0) return <SafeAreaView style={styles.safeArea} />;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <BackButton label="レシピ" onPress={() => router.back()} />
        <Text style={styles.title}>買い出しリスト</Text>
        <Pressable
          style={({ pressed }) => [
            styles.settingsBtn,
            pressed && { opacity: 0.8 },
          ]}
          onPress={() => router.push("/settings")}
          hitSlop={12}
        >
          <Text style={styles.settingsText}>⚙️</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 120 + insets.bottom },
        ]}
      >
        {recipeItems.map((group, rIdx) => {
          const color = RECIPE_COLORS[rIdx % RECIPE_COLORS.length];
          return (
            <View key={rIdx}>
              <View style={styles.sectionHeader}>
                {isMulti && (
                  <View
                    style={[styles.recipeLabel, { backgroundColor: color }]}
                  >
                    <Text style={styles.recipeLabelText}>{rIdx + 1}品目</Text>
                  </View>
                )}
                <Text style={styles.recipe}>{group.name}</Text>
                <View
                  style={[
                    styles.divider,
                    isMulti && { backgroundColor: color },
                  ]}
                />
              </View>

              <View style={styles.card}>
                {group.items.map((item, idx) => {
                  const key = `${rIdx}-${idx}`;
                  const isLast = idx === group.items.length - 1;
                  return (
                    <Pressable
                      key={key}
                      style={[styles.item, isLast && styles.itemLast]}
                      onPress={() =>
                        setChecked((p) => ({ ...p, [key]: !p[key] }))
                      }
                    >
                      <View
                        style={[
                          styles.checkbox,
                          checked[key] && styles.checkboxChecked,
                        ]}
                      >
                        {checked[key] && (
                          <Text style={styles.checkIcon}>✓</Text>
                        )}
                      </View>
                      <Text
                        style={[
                          styles.itemText,
                          checked[key] && styles.itemTextDone,
                        ]}
                      >
                        {item}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        })}
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: 12 + insets.bottom }]}>
        <AppButton
          label="スケジュールを作成"
          onPress={() => router.push(`/schedule/${ids.join(",")}`)}
        />
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  settingsBtn: {
    position: "absolute",
    right: 16,
    top: 0,
    bottom: 0,
    paddingHorizontal: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  settingsText: { fontSize: 24 },
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
  content: { padding: 20 },
  sectionHeader: {
    marginBottom: 16,
  },
  recipeLabel: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: theme.radius.pill,
    marginBottom: 8,
  },
  recipeLabelText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 12,
  },
  recipe: {
    fontSize: 22,
    fontWeight: "700",
    color: theme.colors.text,
    fontFamily: "M PLUS Rounded 1c",
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
    overflow: "hidden",
    marginBottom: 24,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
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
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  checkboxChecked: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  checkIcon: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
    marginTop: -2,
  },
  itemText: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 16,
    lineHeight: 24,
  },
  itemTextDone: {
    textDecorationLine: "line-through",
    color: theme.colors.subText,
  },
  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colors.card,
    paddingHorizontal: 20,
    paddingTop: 16,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 8,
  },
});
