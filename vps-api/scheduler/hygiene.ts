/**
 * Hygiene Correction
 *
 * Inserts washing tasks when switching between raw meat/fish and vegetables
 */

import {
  SchedulerTask,
  CONTAMINATION_KEYWORDS,
  WASH_DURATION_MIN,
} from "./types";

/**
 * Classify contamination category from step description
 */
export function classifyContamination(description: string): string {
  const lower = description.toLowerCase();
  for (const [category, keywords] of Object.entries(CONTAMINATION_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) return category;
    }
  }
  return "other";
}

interface WashInsertion {
  beforeIndex: number;
  reason: string;
}

/**
 * Find positions where washing tasks should be inserted
 */
function findWashInsertions(tasks: SchedulerTask[]): WashInsertion[] {
  const sorted = [...tasks].sort((a, b) => a.start_time - b.start_time);
  const insertions: WashInsertion[] = [];

  let currentContamination = "none";

  for (let i = 0; i < sorted.length; i++) {
    const task = sorted[i];

    if (task.task_type === "wash") {
      currentContamination = "none";
      continue;
    }
    if (!task.uses_cutting_board) continue;

    const category = task.contamination;
    if (category === "none") continue;

    const needsWash =
      (currentContamination === "raw_meat" ||
        currentContamination === "raw_fish") &&
      category !== "raw_meat" &&
      category !== "raw_fish" &&
      category !== "none";

    if (needsWash) {
      insertions.push({
        beforeIndex: i,
        reason: `${currentContamination}の後に${category}を切るため`,
      });
      currentContamination = "none";
    }

    if (category === "raw_meat" || category === "raw_fish") {
      currentContamination = category;
    }
  }

  return insertions;
}

/**
 * Apply hygiene correction by inserting wash tasks
 */
export function applyHygieneCorrection(
  tasks: SchedulerTask[]
): SchedulerTask[] {
  const sorted = [...tasks].sort((a, b) => a.start_time - b.start_time);
  const insertions = findWashInsertions(sorted);

  if (insertions.length === 0) return tasks;

  const result: SchedulerTask[] = [];
  let totalDelay = 0;

  for (let i = 0; i < sorted.length; i++) {
    const wash = insertions.find((ins) => ins.beforeIndex === i);

    if (wash) {
      const task = sorted[i];
      result.push({
        recipe_id: task.recipe_id,
        recipe_name: task.recipe_name,
        step_index: -1,
        step_description: `まな板を洗う（${wash.reason}）`,
        duration: WASH_DURATION_MIN,
        original_duration: WASH_DURATION_MIN,
        uses_stove: false,
        uses_cutting_board: false,
        requires_attention: true,
        start_time: task.start_time + totalDelay,
        color: task.color,
        task_type: "wash",
        contamination: "none",
        tips: "食中毒防止のため、しっかり洗いましょう",
        assigned_cook: -1,
      });
      totalDelay += WASH_DURATION_MIN;
    }

    const task = sorted[i];
    result.push({
      ...task,
      start_time: task.start_time + totalDelay,
    });
  }

  return result;
}
