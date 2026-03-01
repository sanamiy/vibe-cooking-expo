export interface InstructionStep {
  text: string;
  text_en?: string;
  image_url?: string | null;
  image_path?: string | null;
}

export interface Recipe {
  id: string;
  name: string;
  name_en?: string;
  description: string;
  description_en?: string;
  image_url: string;
  image_path?: string | null;
  total_time?: string;
  recipe_servings?: number | null;
  recipe_servings_label?: string | null;
  ingredients?: string[];
  ingredients_en?: string[];
  instructions?: string[];
  instructions_en?: string[];
  instruction_steps?: InstructionStep[];
}

export interface RecipeData {
  recipes: Recipe[];
}
