import recipeData from "@/data/recipe.json";
import { Recipe, RecipeData } from "@/types/recipe";

const data = recipeData as RecipeData;
const recipes = data.recipes;

const getRecipeById = (id: string): Recipe | null =>
  recipes.find((r) => r.id === id) ?? null;

export const useRecipes = () => {
  return {
    recipes,
    getRecipeById,
  };
};
