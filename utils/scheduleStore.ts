/**
 * Module-level store to pass scheduler tips from schedule screen to cook-interactive.
 * Survives navigation but not app restart (which is fine — tips are session-only).
 */

let storedTips: Record<string, string[]> = {};

/** Save per-step tips keyed by recipe_id */
export function setScheduleTips(recipeId: string, tips: string[]) {
  storedTips[recipeId] = tips;
}

/** Retrieve tips for a recipe (returns empty array if none) */
export function getScheduleTips(recipeId: string): string[] {
  return storedTips[recipeId] ?? [];
}

/** Clear all stored tips */
export function clearScheduleTips() {
  storedTips = {};
}
