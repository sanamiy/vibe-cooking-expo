/**
 * Greedy Scheduling Algorithm
 *
 * Assigns tasks to the earliest available time slot
 * Supports multiple cooks with skill levels
 */

import { SchedulerTask, KitchenConfig } from "../types";
import { getSkillMultiplier, applySkillToDuration } from "../skillMultiplier";

type TimeRange = [number, number];

function isResourceAvailable(
  usageList: TimeRange[],
  start: number,
  end: number,
  limit: number
): boolean {
  let count = 0;
  for (const [s, e] of usageList) {
    if (!(end <= s || start >= e)) count++;
  }
  return count < limit;
}

function isCookAvailable(
  cookUsage: TimeRange[][],
  cookIdx: number,
  start: number,
  end: number
): boolean {
  for (const [s, e] of cookUsage[cookIdx]) {
    if (!(end <= s || start >= e)) return false;
  }
  return true;
}

/**
 * Greedy scheduling with multi-cook support
 */
export function greedySchedule(
  allTasks: SchedulerTask[],
  config: KitchenConfig
): SchedulerTask[] {
  const cookSkills = config.cook_skills ?? Array(config.cooks).fill("intermediate");

  // Group tasks by recipe
  const tasksByRecipe = new Map<string, SchedulerTask[]>();
  for (const task of allTasks) {
    const list = tasksByRecipe.get(task.recipe_id) ?? [];
    list.push(task);
    tasksByRecipe.set(task.recipe_id, list);
  }

  // Sort tasks by step index within each recipe
  for (const [, tasks] of tasksByRecipe) {
    tasks.sort((a, b) => a.step_index - b.step_index);
  }

  // Resource usage tracking
  const stoveUsage: TimeRange[] = [];
  const cuttingBoardUsage: TimeRange[] = [];
  const cookUsage: TimeRange[][] = Array.from(
    { length: config.cooks },
    () => []
  );

  // Progress tracking
  const nextTaskIdx = new Map<string, number>();
  const recipeEndTimes = new Map<string, number>();
  for (const rid of tasksByRecipe.keys()) {
    nextTaskIdx.set(rid, 0);
    recipeEndTimes.set(rid, 0);
  }

  const scheduled: SchedulerTask[] = [];

  const hasRemaining = () => {
    for (const [rid, tasks] of tasksByRecipe) {
      if ((nextTaskIdx.get(rid) ?? 0) < tasks.length) return true;
    }
    return false;
  };

  while (hasRemaining()) {
    let bestTask: SchedulerTask | null = null;
    let bestStart = Infinity;
    let bestRecipeId: string | null = null;
    let bestCook = -1;
    let bestDuration = 0;

    for (const [recipeId, tasks] of tasksByRecipe) {
      const idx = nextTaskIdx.get(recipeId) ?? 0;
      if (idx >= tasks.length) continue;

      const task = tasks[idx];
      const earliestStart = recipeEndTimes.get(recipeId) ?? 0;

      // Find earliest available slot
      for (
        let tryStart = earliestStart;
        tryStart < earliestStart + 500;
        tryStart++
      ) {
        if (task.requires_attention) {
          // Try each cook
          for (let cookIdx = 0; cookIdx < config.cooks; cookIdx++) {
            const multiplier = getSkillMultiplier(cookSkills, cookIdx);
            const adjustedDuration = applySkillToDuration(
              task.duration,
              multiplier
            );
            const end = tryStart + adjustedDuration;

            if (!isCookAvailable(cookUsage, cookIdx, tryStart, end)) continue;

            if (
              task.uses_stove &&
              !isResourceAvailable(
                stoveUsage,
                tryStart,
                end,
                config.stove_burners
              )
            ) {
              continue;
            }

            if (
              task.uses_cutting_board &&
              !isResourceAvailable(
                cuttingBoardUsage,
                tryStart,
                end,
                config.cutting_boards
              )
            ) {
              continue;
            }

            if (
              tryStart < bestStart ||
              (tryStart === bestStart && adjustedDuration < bestDuration)
            ) {
              bestTask = task;
              bestStart = tryStart;
              bestRecipeId = recipeId;
              bestCook = cookIdx;
              bestDuration = adjustedDuration;
            }
            break;
          }
          if (bestCook >= 0 && bestStart === tryStart) break;
        } else {
          // Passive task - no cook needed
          const end = tryStart + task.duration;

          if (
            task.uses_stove &&
            !isResourceAvailable(
              stoveUsage,
              tryStart,
              end,
              config.stove_burners
            )
          ) {
            continue;
          }

          if (
            task.uses_cutting_board &&
            !isResourceAvailable(
              cuttingBoardUsage,
              tryStart,
              end,
              config.cutting_boards
            )
          ) {
            continue;
          }

          if (tryStart < bestStart) {
            bestTask = task;
            bestStart = tryStart;
            bestRecipeId = recipeId;
            bestCook = -1;
            bestDuration = task.duration;
          }
          break;
        }
      }
    }

    if (!bestTask || bestRecipeId === null) break;

    // Schedule the task
    bestTask.start_time = bestStart;
    bestTask.original_duration = bestTask.duration;
    bestTask.duration = bestDuration;
    bestTask.assigned_cook = bestCook;
    const endTime = bestStart + bestDuration;

    if (bestTask.uses_stove) stoveUsage.push([bestStart, endTime]);
    if (bestTask.uses_cutting_board)
      cuttingBoardUsage.push([bestStart, endTime]);
    if (bestTask.requires_attention && bestCook >= 0) {
      cookUsage[bestCook].push([bestStart, endTime]);
    }

    recipeEndTimes.set(bestRecipeId, endTime);
    nextTaskIdx.set(bestRecipeId, (nextTaskIdx.get(bestRecipeId) ?? 0) + 1);
    scheduled.push(bestTask);
  }

  return scheduled;
}
