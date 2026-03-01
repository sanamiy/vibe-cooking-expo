/**
 * Scheduler API Entry Point
 *
 * Provides unified interface for all scheduling algorithms
 */

import {
  ScheduleRequest,
  ScheduleResponse,
  SchedulerTask,
  ScheduledTask,
  RecipeInput,
  KitchenConfig,
  AlgorithmType,
  RECIPE_COLORS,
  TaskType,
} from "./types";
import { greedySchedule } from "./algorithms/greedy";
import { criticalPathSchedule } from "./algorithms/criticalPath";
import { geneticSchedule } from "./algorithms/genetic";
import { backwardSchedule } from "./algorithms/backward";
import { astarSchedule } from "./algorithms/astar";
import { applyHygieneCorrection, classifyContamination } from "./hygiene";
import { estimateEatingWindow } from "./eatingWindow";

export * from "./types";

// ─── Step Classification ─────────────────────────────

function classifyStep(text: string): {
  uses_stove: boolean;
  uses_cutting_board: boolean;
  requires_attention: boolean;
} {
  const clean = text.replace(/<[^>]*>/g, ""); // Strip HTML
  return {
    uses_stove:
      /[焼炒煮沸茹蒸]/.test(clean) ||
      /コンロ|火にかけ|フライパン|鍋/.test(clean),
    uses_cutting_board: /[切刻]/.test(clean) || /みじん/.test(clean),
    requires_attention: !/煮込|蒸らし|放置|浸[しけ]|冷ま/.test(clean),
  };
}

function getTaskType(usesStove: boolean, requiresAttention: boolean): TaskType {
  if (usesStove) {
    return requiresAttention ? "cook_active" : "cook_passive";
  }
  return "prep";
}

function splitStepDescriptionClauses(description: string): string[] {
  const normalized = description.replace(/<[^>]*>/g, "").replace(/[。．]+/g, "。").trim();
  if (!normalized) return [];

  const sentences = normalized
    .split("。")
    .map((s) => s.trim())
    .filter(Boolean);

  const clauses: string[] = [];
  for (const sentence of sentences) {
    const pieces = sentence
      .split(/(?:してから|し終えたら|したら|して|し、| then | and )/i)
      .map((s) => s.trim())
      .filter((s) => s.length >= 2);
    if (pieces.length > 0) clauses.push(...pieces);
  }

  return clauses.length > 0 ? clauses : [normalized];
}

function splitTaskConsecutively(task: SchedulerTask): SchedulerTask[] {
  const clauses = splitStepDescriptionClauses(task.step_description);
  const canSplit = clauses.length >= 2 && task.duration >= 2;
  if (!canSplit) return [task];

  const partCount = Math.min(clauses.length, Math.min(task.duration, 4));
  const selected = clauses.slice(0, partCount);
  const base = Math.floor(task.duration / partCount);
  const remainder = task.duration % partCount;

  return selected.map((description, i) => {
    const duration = Math.max(1, base + (i < remainder ? 1 : 0));
    return {
      ...task,
      step_description: description,
      duration,
      original_duration: duration,
    };
  });
}

function applySequentialSplit(tasks: SchedulerTask[]): SchedulerTask[] {
  const ordered = [...tasks].sort((a, b) => a.step_index - b.step_index);
  const expanded: SchedulerTask[] = [];

  for (const task of ordered) {
    expanded.push(...splitTaskConsecutively(task));
  }

  return expanded.map((task, index) => ({
    ...task,
    step_index: index,
  }));
}

// ─── Build Tasks from Recipe ─────────────────────────

function buildTasksFromRecipe(
  recipe: RecipeInput,
  color: string,
  analyzedSteps?: Array<{
    step_index: number;
    step_description: string;
    duration: number;
    uses_stove: boolean;
    uses_cutting_board: boolean;
    requires_attention: boolean;
    tips?: string;
  }>,
): SchedulerTask[] {
  if (analyzedSteps && analyzedSteps.length > 0) {
    // Use LLM-analyzed steps
    const tasks = analyzedSteps.map((sr) => {
      const needsAttention = sr.requires_attention || sr.step_index === 0;
      const taskType = getTaskType(sr.uses_stove, needsAttention);
      return {
        recipe_id: recipe.id,
        recipe_name: recipe.name,
        step_index: sr.step_index,
        step_description: sr.step_description,
        duration: sr.duration,
        original_duration: sr.duration,
        uses_stove: sr.uses_stove,
        uses_cutting_board: sr.uses_cutting_board,
        requires_attention: needsAttention,
        start_time: 0,
        color,
        task_type: taskType,
        contamination: sr.uses_cutting_board
          ? classifyContamination(sr.step_description)
          : "none",
        tips: sr.tips ?? "",
        assigned_cook: -1,
      };
    });
    return applySequentialSplit(tasks);
  }

  // Fallback: rule-based classification
  const fallbackTasks = recipe.steps.map((step, idx) => {
    const classified = classifyStep(step.text);
    const needsAttention = classified.requires_attention || idx === 0;
    const taskType = getTaskType(classified.uses_stove, needsAttention);
    const description = step.text.replace(/<[^>]*>/g, "");

    return {
      recipe_id: recipe.id,
      recipe_name: recipe.name,
      step_index: idx,
      step_description: description,
      duration: step.duration_hint ?? 5,
      original_duration: step.duration_hint ?? 5,
      uses_stove: classified.uses_stove,
      uses_cutting_board: classified.uses_cutting_board,
      requires_attention: needsAttention,
      start_time: 0,
      color,
      task_type: taskType,
      contamination: classified.uses_cutting_board
        ? classifyContamination(description)
        : "none",
      tips: "",
      assigned_cook: -1,
    };
  });
  return applySequentialSplit(fallbackTasks);
}

// ─── Metrics Calculation ─────────────────────────────

function countParallelWindows(tasks: SchedulerTask[]): number {
  if (tasks.length === 0) return 0;

  const events: Array<[number, number]> = [];
  for (const t of tasks) {
    events.push([t.start_time, 1]);
    events.push([t.start_time + t.duration, -1]);
  }

  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  let current = 0;
  let parallelWindows = 0;

  for (const [, delta] of events) {
    const prev = current;
    current += delta;
    if (current > 1 && prev <= 1) {
      parallelWindows++;
    }
  }

  return parallelWindows;
}

// ─── Main Scheduling Function ────────────────────────

export interface AnalyzedRecipe {
  recipeId: string;
  steps: Array<{
    step_index: number;
    step_description: string;
    duration: number;
    uses_stove: boolean;
    uses_cutting_board: boolean;
    requires_attention: boolean;
    tips?: string;
  }>;
}

export async function createSchedule(
  request: ScheduleRequest,
  analyzedRecipes?: AnalyzedRecipe[],
): Promise<ScheduleResponse> {
  const startTime = Date.now();

  const { recipes, kitchen, options = {} } = request;
  const {
    algorithm = "auto",
    sync_tolerance = 0,
    sync_weight = 0,
    hygiene_correction = true,
  } = options;

  // Build tasks for all recipes
  const allTasks: SchedulerTask[] = [];
  for (let i = 0; i < recipes.length; i++) {
    const recipe = recipes[i];
    const color = RECIPE_COLORS[i % RECIPE_COLORS.length];

    const analyzed = analyzedRecipes?.find((ar) => ar.recipeId === recipe.id);
    const tasks = buildTasksFromRecipe(recipe, color, analyzed?.steps);
    allTasks.push(...tasks);
  }

  // Select and run algorithm
  let scheduled: SchedulerTask[];
  let algorithmUsed: string;

  const effectiveAlgorithm: AlgorithmType =
    algorithm === "auto"
      ? recipes.length === 3
        ? "greedy"
        : recipes.length > 1
          ? "genetic"
          : "greedy"
      : algorithm;

  switch (effectiveAlgorithm) {
    case "critical_path":
      scheduled = criticalPathSchedule(allTasks, kitchen);
      algorithmUsed = "critical_path";
      break;
    case "genetic":
      scheduled = geneticSchedule(
        allTasks,
        kitchen,
        sync_tolerance,
        sync_weight,
      );
      algorithmUsed = "genetic";
      break;
    case "backward":
      scheduled = backwardSchedule(allTasks, kitchen);
      algorithmUsed = "backward";
      break;
    case "astar":
      scheduled = astarSchedule(allTasks, kitchen);
      algorithmUsed = "astar";
      break;
    case "claude_e2e":
      // claude_e2e mode is handled at API layer; keep deterministic fallback here.
      scheduled = greedySchedule(allTasks, kitchen);
      algorithmUsed = "claude_e2e+greedy_fallback";
      break;
    case "greedy":
    default:
      scheduled = greedySchedule(allTasks, kitchen);
      algorithmUsed = "greedy";
      break;
  }

  // Apply hygiene correction
  if (hygiene_correction) {
    scheduled = applyHygieneCorrection(scheduled);
    algorithmUsed += "+hygiene";
  }

  // Calculate metrics
  const recipeEndTimes: Record<string, number> = {};
  for (const t of scheduled) {
    const end = t.start_time + t.duration;
    recipeEndTimes[t.recipe_id] = Math.max(
      recipeEndTimes[t.recipe_id] ?? 0,
      end,
    );
  }

  const endTimes = Object.values(recipeEndTimes);
  const syncVariance =
    endTimes.length > 1 ? Math.max(...endTimes) - Math.min(...endTimes) : 0;

  const totalTime =
    scheduled.length > 0
      ? Math.max(...scheduled.map((t) => t.start_time + t.duration))
      : 0;

  // Convert to response format
  const scheduledTasks: ScheduledTask[] = scheduled.map((t, idx) => ({
    task_id: `${t.recipe_id}-${idx}`,
    recipe_id: t.recipe_id,
    recipe_name: t.recipe_name,
    step_index: t.step_index,
    description: t.step_description,
    start_time: t.start_time,
    duration: t.duration,
    end_time: t.start_time + t.duration,
    uses_stove: t.uses_stove,
    uses_cutting_board: t.uses_cutting_board,
    requires_attention: t.requires_attention,
    assigned_cook: t.assigned_cook >= 0 ? t.assigned_cook : undefined,
    task_type: t.task_type,
    color: t.color,
    tips: t.tips || undefined,
  }));

  // Estimate eating windows
  const eatingWindows = recipes.map((recipe) => estimateEatingWindow(recipe));

  const computationTime = Date.now() - startTime;

  return {
    schedule: {
      tasks: scheduledTasks,
      total_time: totalTime,
      algorithm_used: algorithmUsed,
    },
    eating_windows: eatingWindows,
    metrics: {
      computation_time_ms: computationTime,
      sync_variance: syncVariance,
      parallel_windows: countParallelWindows(scheduled),
      recipe_end_times: recipeEndTimes,
    },
  };
}
