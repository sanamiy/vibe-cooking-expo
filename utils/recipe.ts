import { Recipe } from "@/types/recipe";

export const MAX_SELECTION = 5;

export const getLocalizedName = (recipe: Recipe, language: string): string => {
  if (language === "en" && recipe.name_en) return recipe.name_en;
  return recipe.name;
};

export const getLocalizedDescription = (recipe: Recipe, language: string): string => {
  if (language === "en" && recipe.description_en) return recipe.description_en;
  return recipe.description ?? "";
};

export const formatTime = (timeStr?: string, language = "ja") => {
  if (!timeStr) return "";
  const match = timeStr.match(/PT(\d+)M/);
  if (match?.[1]) return language === "en" ? `${match[1]} min` : `${match[1]}分`;
  return timeStr;
};

export const getLocalizedServingsLabel = (recipe: Recipe, language: string): string => {
  if (!recipe.recipe_servings) return "";
  return language === "en"
    ? `${recipe.recipe_servings} serving${recipe.recipe_servings > 1 ? "s" : ""}`
    : `${recipe.recipe_servings}人前`;
};

export const getLocalizedIngredients = (recipe: Recipe, language: string): string[] => {
  if (language === "en" && recipe.ingredients_en?.length) return recipe.ingredients_en;
  return recipe.ingredients ?? [];
};

export const getLocalizedInstructions = (recipe: Recipe, language: string): string[] => {
  if (language === "en" && recipe.instructions_en?.length) return recipe.instructions_en;
  return recipe.instructions ?? [];
};

export const getLocalizedInstructionSteps = (
  recipe: Recipe,
  language: string,
): { text: string; image_url?: string | null; image_path?: string | null }[] => {
  const steps = recipe.instruction_steps ?? [];
  if (language === "en") {
    return steps.map((s) => ({
      ...s,
      text: s.text_en ?? s.text,
    }));
  }
  return steps;
};

export const stripHtml = (text: string) =>
  text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .trim();

export const stripHtmlInline = (text: string) =>
  text
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const toHalfWidth = (text: string) =>
  text.replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xfee0));

export const scaleIngredient = (ingredient: string, mult: number) => {
  if (mult === 1) return ingredient;
  return toHalfWidth(ingredient).replace(/([\d]+(?:\/[\d]+)?(?:\.[\d]+)?)/g, (match) => {
    try {
      if (match.includes("/")) {
        const [num, den] = match.split("/");
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
