import { Recipe } from '@/types/recipe';

export const MAX_SELECTION = 5;

export const formatTime = (timeStr?: string) => {
  if (!timeStr) return '';
  const match = timeStr.match(/PT(\d+)M/);
  if (match?.[1]) return `${match[1]}分`;
  return timeStr;
};

export const stripHtml = (text: string) => text.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '').trim();

const toHalfWidth = (text: string) => text.replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xfee0));

export const scaleIngredient = (ingredient: string, mult: number) => {
  if (mult === 1) return ingredient;
  return toHalfWidth(ingredient).replace(/([\d]+(?:\/[\d]+)?(?:\.[\d]+)?)/g, (match) => {
    try {
      if (match.includes('/')) {
        const [num, den] = match.split('/');
        const val = (parseFloat(num) / parseFloat(den)) * mult;
        return Number.isInteger(val) ? val.toString() : val.toFixed(1);
      }
      const val = parseFloat(match) * mult;
      return Number.isInteger(val) ? val.toString() : val.toFixed(1);
    } catch {
      return match;
    }
  });
};

export const multiplierForRecipe = (recipe: Recipe | null, servingsPerMeal: number) => {
  if (!recipe?.recipe_servings) return 1;
  return servingsPerMeal / recipe.recipe_servings;
};
