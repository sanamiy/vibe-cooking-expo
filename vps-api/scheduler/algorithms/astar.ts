/**
 * A* Search Scheduling Algorithm
 *
 * Uses state-space search to find optimal task ordering
 */

import { SchedulerTask, KitchenConfig } from "../types";
import { backwardSchedule } from "./backward";

interface ScheduleState {
  time: number;
  scheduled: Array<[string, number, number]>; // [recipe_id, step_idx, start_time]
  nextStep: Map<string, number>;
  stoveFreeAt: number;
  boardFreeAt: number;
  attentionFreeAt: number;
}

function stateKey(state: ScheduleState): string {
  const scheduled = state.scheduled
    .map(([r, s, t]) => `${r}:${s}:${t}`)
    .join(",");
  const next = Array.from(state.nextStep.entries())
    .sort()
    .map(([r, n]) => `${r}=${n}`)
    .join(",");
  return `${state.time}|${scheduled}|${next}`;
}

interface AStarOptions {
  maxIterations?: number;
}

/**
 * A* search scheduling
 */
export function astarSchedule(
  allTasks: SchedulerTask[],
  config: KitchenConfig,
  options: AStarOptions = {}
): SchedulerTask[] {
  const { maxIterations = 10000 } = options;

  // Group tasks by recipe
  const tasksByRecipe = new Map<string, SchedulerTask[]>();
  for (const task of allTasks) {
    const list = tasksByRecipe.get(task.recipe_id) ?? [];
    list.push({ ...task }); // Clone
    tasksByRecipe.set(task.recipe_id, list);
  }

  for (const [, tasks] of tasksByRecipe) {
    tasks.sort((a, b) => a.step_index - b.step_index);
  }

  const recipeIds = Array.from(tasksByRecipe.keys());
  const totalSteps = new Map<string, number>();
  for (const [rid, tasks] of tasksByRecipe) {
    totalSteps.set(rid, tasks.length);
  }

  // Heuristic: remaining task time
  const heuristic = (state: ScheduleState): number => {
    let remaining = 0;
    for (const rid of recipeIds) {
      const nextIdx = state.nextStep.get(rid) ?? 0;
      const total = totalSteps.get(rid) ?? 0;
      const tasks = tasksByRecipe.get(rid) ?? [];
      for (let i = nextIdx; i < total; i++) {
        remaining += tasks[i].duration;
      }
    }
    return remaining / Math.max(config.cooks, 1);
  };

  // Get successors
  const getSuccessors = (
    state: ScheduleState
  ): Array<{ cost: number; state: ScheduleState }> => {
    const successors: Array<{ cost: number; state: ScheduleState }> = [];

    for (const rid of recipeIds) {
      const stepIdx = state.nextStep.get(rid) ?? 0;
      const total = totalSteps.get(rid) ?? 0;
      if (stepIdx >= total) continue;

      const tasks = tasksByRecipe.get(rid) ?? [];
      const task = tasks[stepIdx];

      // Calculate earliest start
      let earliest = state.time;

      // Must wait for previous task in same recipe
      for (const [r, s, start] of state.scheduled) {
        if (r === rid && s === stepIdx - 1) {
          const prevTask = tasks[stepIdx - 1];
          earliest = Math.max(earliest, start + prevTask.duration);
        }
      }

      // Resource constraints
      if (task.uses_stove) {
        earliest = Math.max(earliest, state.stoveFreeAt);
      }
      if (task.uses_cutting_board) {
        earliest = Math.max(earliest, state.boardFreeAt);
      }
      if (task.requires_attention) {
        earliest = Math.max(earliest, state.attentionFreeAt);
      }

      const endTime = earliest + task.duration;

      // Create new state
      const newNextStep = new Map(state.nextStep);
      newNextStep.set(rid, stepIdx + 1);

      const newState: ScheduleState = {
        time: Math.max(state.time, endTime),
        scheduled: [...state.scheduled, [rid, stepIdx, earliest]],
        nextStep: newNextStep,
        stoveFreeAt: task.uses_stove ? endTime : state.stoveFreeAt,
        boardFreeAt: task.uses_cutting_board ? endTime : state.boardFreeAt,
        attentionFreeAt: task.requires_attention
          ? endTime
          : state.attentionFreeAt,
      };

      successors.push({
        cost: endTime - state.time,
        state: newState,
      });
    }

    return successors;
  };

  // Check if goal state
  const isGoal = (state: ScheduleState): boolean => {
    for (const rid of recipeIds) {
      const nextIdx = state.nextStep.get(rid) ?? 0;
      const total = totalSteps.get(rid) ?? 0;
      if (nextIdx < total) return false;
    }
    return true;
  };

  // Initial state
  const initialNextStep = new Map<string, number>();
  for (const rid of recipeIds) {
    initialNextStep.set(rid, 0);
  }

  const initialState: ScheduleState = {
    time: 0,
    scheduled: [],
    nextStep: initialNextStep,
    stoveFreeAt: 0,
    boardFreeAt: 0,
    attentionFreeAt: 0,
  };

  // A* search
  const openSet: Array<{
    fScore: number;
    gScore: number;
    state: ScheduleState;
  }> = [
    {
      fScore: heuristic(initialState),
      gScore: 0,
      state: initialState,
    },
  ];

  const closedSet = new Set<string>();
  const gScores = new Map<string, number>();
  gScores.set(stateKey(initialState), 0);

  let iterations = 0;
  let bestState: ScheduleState | null = null;

  while (openSet.length > 0 && iterations < maxIterations) {
    iterations++;

    // Get state with lowest f-score
    openSet.sort((a, b) => a.fScore - b.fScore);
    const current = openSet.shift()!;

    const key = stateKey(current.state);
    if (closedSet.has(key)) continue;

    if (isGoal(current.state)) {
      bestState = current.state;
      break;
    }

    closedSet.add(key);

    for (const { cost, state: successor } of getSuccessors(current.state)) {
      const successorKey = stateKey(successor);
      if (closedSet.has(successorKey)) continue;

      const newG = current.gScore + cost;
      const existingG = gScores.get(successorKey);

      if (existingG === undefined || newG < existingG) {
        gScores.set(successorKey, newG);
        const fScore = newG + heuristic(successor);
        openSet.push({
          fScore,
          gScore: newG,
          state: successor,
        });
      }
    }
  }

  if (!bestState) {
    console.warn(`A* search failed after ${iterations} iterations, falling back`);
    return backwardSchedule(allTasks, config);
  }

  // Apply results to tasks
  for (const [rid, stepIdx, startTime] of bestState.scheduled) {
    const tasks = tasksByRecipe.get(rid);
    if (tasks && tasks[stepIdx]) {
      tasks[stepIdx].start_time = startTime;
    }
  }

  const result: SchedulerTask[] = [];
  for (const [, tasks] of tasksByRecipe) {
    result.push(...tasks);
  }

  return result;
}
