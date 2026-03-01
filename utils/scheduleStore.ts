/**
 * Module-level store to pass scheduler data from schedule screen to cook-interactive.
 * Survives navigation but not app restart (which is fine — data is session-only).
 */

import type { SchedulerTask } from "./scheduler";

let storedTips: Record<string, string[]> = {};
let storedTasks: Record<string, SchedulerTask[]> = {};

/** Save per-step tips keyed by recipe_id */
export function setScheduleTips(recipeId: string, tips: string[]) {
  storedTips[recipeId] = tips;
}

/** Retrieve tips for a recipe (returns empty array if none) */
export function getScheduleTips(recipeId: string): string[] {
  return storedTips[recipeId] ?? [];
}

/** Save scheduler tasks keyed by recipe_id */
export function setScheduleTasks(recipeId: string, tasks: SchedulerTask[]) {
  storedTasks[recipeId] = tasks;
}

/** Retrieve scheduler tasks for a recipe (returns empty array if none) */
export function getScheduleTasks(recipeId: string): SchedulerTask[] {
  return storedTasks[recipeId] ?? [];
}

/** Clear all stored data */
export function clearScheduleData() {
  storedTips = {};
  storedTasks = {};
}
