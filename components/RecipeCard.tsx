import { theme } from '@/constants/theme';
import { Recipe } from '@/types/recipe';
import { formatTime } from '@/utils/recipe';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

interface Props {
  recipe: Recipe;
  isSelected: boolean;
  onToggle: (id: string) => void;
}

export const RecipeCard = ({ recipe, isSelected, onToggle }: Props) => (
  <Pressable onPress={() => onToggle(recipe.id)} style={[styles.card, isSelected && styles.selected]}>
    <Image source={{ uri: recipe.image_url }} style={styles.img} resizeMode="cover" />
    <View style={styles.body}>
      <Text style={styles.title}>{recipe.name}</Text>
      <Text style={styles.desc} numberOfLines={2}>
        {recipe.description}
      </Text>
      <View style={styles.metaRow}>
        <Text style={styles.meta}>⏱ {formatTime(recipe.total_time)}</Text>
        {recipe.recipe_servings_label ? <Text style={styles.meta}>👨‍👩‍👧‍👦 {recipe.recipe_servings_label}</Text> : null}
      </View>
    </View>
  </Pressable>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    borderWidth: 2,
    borderColor: 'transparent',
    overflow: 'hidden',
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  selected: {
    borderColor: theme.colors.primary,
  },
  img: {
    width: '100%',
    height: 180,
  },
  body: {
    padding: 12,
    gap: 6,
  },
  title: {
    fontWeight: '700',
    fontSize: 16,
    color: theme.colors.text,
  },
  desc: {
    color: theme.colors.subText,
    fontSize: 13,
    lineHeight: 18,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 12,
  },
  meta: {
    color: theme.colors.subText,
    fontSize: 12,
    fontWeight: '600',
  },
});
