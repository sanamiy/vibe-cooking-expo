import { theme } from "@/constants/theme";
import { Recipe } from "@/types/recipe";
import { formatTime } from "@/utils/recipe";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

interface Props {
  recipe: Recipe;
  isSelected: boolean;
  onToggle: (id: string) => void;
}

export const RecipeCard = ({ recipe, isSelected, onToggle }: Props) => (
  <Pressable
    onPress={() => onToggle(recipe.id)}
    style={[styles.card, isSelected && styles.selected]}
  >
    <View style={styles.imageContainer}>
      <Image source={{ uri: recipe.image_url }} style={styles.img} resizeMode="cover" />
    </View>
    <View style={styles.body}>
      <Text style={styles.title}>{recipe.name}</Text>
      <Text style={styles.desc} numberOfLines={2}>
        {recipe.description}
      </Text>
      <View style={styles.metaRow}>
        <View style={styles.metaItem}>
          <Text style={styles.metaIcon}>⏱</Text>
          <Text style={styles.meta}>{formatTime(recipe.total_time)}</Text>
        </View>
        {recipe.recipe_servings_label ? (
          <View style={styles.metaItem}>
            <Text style={styles.metaIcon}>👨‍👩‍👧‍👦</Text>
            <Text style={styles.meta}>{recipe.recipe_servings_label}</Text>
          </View>
        ) : null}
      </View>
    </View>
  </Pressable>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    borderWidth: 2,
    borderColor: "transparent",
    overflow: "hidden",
    // iOS Shadow
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    // Android Shadow
    elevation: 4,
  },
  selected: {
    borderColor: theme.colors.primary,
  },
  imageContainer: {
    position: "relative",
  },
  img: {
    width: "100%",
    height: 180,
  },
  body: {
    padding: 16,
    gap: 8,
  },
  title: {
    fontFamily: "M PLUS Rounded 1c",
    fontWeight: "700",
    fontSize: 20,
    color: theme.colors.text,
  },
  desc: {
    color: theme.colors.subText,
    fontSize: 14,
    lineHeight: 22,
  },
  metaRow: {
    flexDirection: "row",
    gap: 16,
    marginTop: 4,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: theme.colors.bg,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: theme.radius.sm,
  },
  metaIcon: {
    fontSize: 14,
  },
  meta: {
    color: theme.colors.subText,
    fontSize: 12,
    fontWeight: "600",
  },
});
