/**
 * Critical Path Scheduling Algorithm
 *
 * Prioritizes recipes with the longest total duration (critical path)
 * Then applies greedy scheduling
 */

import { SchedulerTask, KitchenConfig } from "../types";
import { greedySchedule } from "./greedy";

/**
 * Critical path scheduling
 */
export function criticalPathSchedule(
  allTasks: SchedulerTask[],
  config: KitchenConfig
): SchedulerTask[] {
  // Group tasks by recipe and calculate total time
  const tasksByRecipe = new Map<string, SchedulerTask[]>();
  const recipeTotalTime = new Map<string, number>();

  for (const task of allTasks) {
    const list = tasksByRecipe.get(task.recipe_id) ?? [];
    list.push(task);
    tasksByRecipe.set(task.recipe_id, list);

    const current = recipeTotalTime.get(task.recipe_id) ?? 0;
    recipeTotalTime.set(task.recipe_id, current + task.duration);
  }

  // Sort recipes by total time (descending - longest first)
  const sortedRecipes = Array.from(recipeTotalTime.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([rid]) => rid);

  // Reorder tasks by critical path priority
  const priorityTasks: SchedulerTask[] = [];
  for (const recipeId of sortedRecipes) {
    const tasks = tasksByRecipe.get(recipeId) ?? [];
    tasks.sort((a, b) => a.step_index - b.step_index);
    priorityTasks.push(...tasks);
  }

  // Apply greedy scheduling with priority order
  return greedySchedule(priorityTasks, config);
}
