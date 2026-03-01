/**
 * Backward Scheduling Algorithm
 *
 * Schedules tasks backwards from a target completion time
 * to achieve simultaneous completion of all recipes
 */

import { SchedulerTask, KitchenConfig } from "../types";

type TimeRange = [number, number];

function countUsage(usageList: TimeRange[], start: number, end: number): number {
  let count = 0;
  for (const [s, e] of usageList) {
    if (!(end <= s || start >= e)) count++;
  }
  return count;
}

/**
 * Find earliest available slot for a task
 */
function findEarliestSlot(
  task: SchedulerTask,
  earliest: number,
  stoveUsage: TimeRange[],
  cuttingBoardUsage: TimeRange[],
  attentionUsage: TimeRange[],
  config: KitchenConfig
): number {
  for (let tryStart = earliest; tryStart < earliest + 1000; tryStart++) {
    const end = tryStart + task.duration;

    if (task.uses_stove) {
      if (countUsage(stoveUsage, tryStart, end) >= config.stove_burners) {
        continue;
      }
    }

    if (task.uses_cutting_board) {
      if (countUsage(cuttingBoardUsage, tryStart, end) >= config.cutting_boards) {
        continue;
      }
    }

    if (task.requires_attention) {
      if (countUsage(attentionUsage, tryStart, end) >= config.cooks) {
        continue;
      }
    }

    return tryStart;
  }

  return earliest;
}

/**
 * Resolve resource conflicts using priority queue
 */
function resolveResourceConflicts(
  tasks: SchedulerTask[],
  config: KitchenConfig
): SchedulerTask[] {
  // Group by recipe
  const tasksByRecipe = new Map<string, SchedulerTask[]>();
  for (const task of tasks) {
    const list = tasksByRecipe.get(task.recipe_id) ?? [];
    list.push(task);
    tasksByRecipe.set(task.recipe_id, list);
  }

  for (const [, recipeTasks] of tasksByRecipe) {
    recipeTasks.sort((a, b) => a.step_index - b.step_index);
  }

  // Resource tracking
  const stoveUsage: TimeRange[] = [];
  const cuttingBoardUsage: TimeRange[] = [];
  const attentionUsage: TimeRange[] = [];
  const recipeEndTimes = new Map<string, number>();

  for (const rid of tasksByRecipe.keys()) {
    recipeEndTimes.set(rid, 0);
  }

  const result: SchedulerTask[] = [];
  const nextIdx = new Map<string, number>();
  for (const rid of tasksByRecipe.keys()) {
    nextIdx.set(rid, 0);
  }

  // Priority queue: (start_time, recipe_id, step_index, task)
  const pq: Array<{
    startTime: number;
    recipeId: string;
    stepIdx: number;
    task: SchedulerTask;
  }> = [];

  // Add first task of each recipe
  for (const [rid, recipeTasks] of tasksByRecipe) {
    if (recipeTasks.length > 0) {
      const task = recipeTasks[0];
      pq.push({
        startTime: task.start_time,
        recipeId: rid,
        stepIdx: 0,
        task,
      });
    }
  }

  while (pq.length > 0) {
    // Sort by start time
    pq.sort((a, b) => a.startTime - b.startTime);
    const item = pq.shift()!;

    if (item.stepIdx !== (nextIdx.get(item.recipeId) ?? 0)) {
      continue; // Already processed
    }

    const earliest = recipeEndTimes.get(item.recipeId) ?? 0;
    const actualStart = findEarliestSlot(
      item.task,
      earliest,
      stoveUsage,
      cuttingBoardUsage,
      attentionUsage,
      config
    );

    item.task.start_time = actualStart;
    const endTime = actualStart + item.task.duration;

    if (item.task.uses_stove) stoveUsage.push([actualStart, endTime]);
    if (item.task.uses_cutting_board)
      cuttingBoardUsage.push([actualStart, endTime]);
    if (item.task.requires_attention)
      attentionUsage.push([actualStart, endTime]);

    recipeEndTimes.set(item.recipeId, endTime);
    nextIdx.set(item.recipeId, item.stepIdx + 1);
    result.push(item.task);

    // Add next task
    const recipeTasks = tasksByRecipe.get(item.recipeId) ?? [];
    const nextStepIdx = item.stepIdx + 1;
    if (nextStepIdx < recipeTasks.length) {
      const nextTask = recipeTasks[nextStepIdx];
      pq.push({
        startTime: nextTask.start_time,
        recipeId: item.recipeId,
        stepIdx: nextStepIdx,
        task: nextTask,
      });
    }
  }

  return result;
}

/**
 * Backward scheduling for simultaneous completion
 */
export function backwardSchedule(
  allTasks: SchedulerTask[],
  config: KitchenConfig
): SchedulerTask[] {
  // Group tasks by recipe
  const tasksByRecipe = new Map<string, SchedulerTask[]>();
  for (const task of allTasks) {
    const list = tasksByRecipe.get(task.recipe_id) ?? [];
    list.push({ ...task }); // Clone to avoid mutation
    tasksByRecipe.set(task.recipe_id, list);
  }

  for (const [, tasks] of tasksByRecipe) {
    tasks.sort((a, b) => a.step_index - b.step_index);
  }

  // Calculate total time per recipe
  const recipeTotalTime = new Map<string, number>();
  for (const [rid, tasks] of tasksByRecipe) {
    const total = tasks.reduce((sum, t) => sum + t.duration, 0);
    recipeTotalTime.set(rid, total);
  }

  // Find longest recipe
  const maxTotalTime = Math.max(...recipeTotalTime.values());

  // Calculate start offset for each recipe (for simultaneous completion)
  const recipeStartOffset = new Map<string, number>();
  for (const [rid, total] of recipeTotalTime) {
    recipeStartOffset.set(rid, maxTotalTime - total);
  }

  // Schedule backwards
  const scheduledTasks: SchedulerTask[] = [];
  for (const [recipeId, tasks] of tasksByRecipe) {
    let currentTime = recipeStartOffset.get(recipeId) ?? 0;
    for (const task of tasks) {
      task.start_time = currentTime;
      currentTime += task.duration;
      scheduledTasks.push(task);
    }
  }

  // Resolve resource conflicts
  return resolveResourceConflicts(scheduledTasks, config);
}
