export interface InstructionStep {
  text: string;
  image_url?: string | null;
  image_path?: string | null;
}

export interface Recipe {
  id: string;
  name: string;
  description: string;
  image_url: string;
  image_path?: string | null;
  total_time?: string;
  recipe_servings?: number | null;
  recipe_servings_label?: string | null;
  ingredients?: string[];
  instructions?: string[];
  instruction_steps?: InstructionStep[];
}

export interface RecipeData {
  recipes: Recipe[];
}
