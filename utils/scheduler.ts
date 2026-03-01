/**
 * Multi-Recipe Greedy Scheduler + Hygiene Correction
 *
 * Ported from vibe-cooking2/backend/scheduler.py & hygiene.py
 *
 * 1. analyzeRecipeWithLLM() — Claude APIでレシピ工程を分析・分割
 * 2. classifyStep()          — ルールベースのフォールバック
 * 3. greedySchedule()        — 貪欲法でリソース制約付きスケジューリング
 * 4. applyHygieneCorrection() — 洗い物タスク挿入
 * 5. scheduleMultipleRecipes() — エントリポイント
 */

import { stripHtmlInline } from "@/utils/recipe";
import type { Recipe } from "@/types/recipe";
import { buildRecipeGantt, type GanttTask } from "@/utils/gantt";
import { postJsonVps, shouldUseServerProxy } from "@/services/vpsClient";
import { callAnthropicMessages } from "@/services/anthropicClient";

// ─── Types ──────────────────────────────────────────

export interface SchedulerTask {
  recipe_id: string;
  recipe_name: string;
  step_index: number;
  step_description: string;
  duration: number;
  uses_stove: boolean;
  uses_cutting_board: boolean;
  requires_attention: boolean;
  start_time: number;
  color: string;
  /** "prep" | "cook_active" | "cook_passive" | "wash" */
  task_type: string;
  /** 汚染カテゴリ for hygiene logic */
  contamination: string;
  /** 工程の注意点・コツ */
  tips: string;
}

export interface MultiRecipeSchedule {
  tasks: SchedulerTask[];
  total_time: number;
  algorithm_used: string;
}

export type SchedulerAlgorithmType =
  | "auto"
  | "greedy"
  | "genetic"
  | "critical_path"
  | "backward"
  | "astar"
  | "claude_e2e";

// ─── Constants ──────────────────────────────────────

export const RECIPE_COLORS = [
  "#FF6B6B", // コーラルピンク
  "#4ECDC4", // ミントグリーン
  "#FFE66D", // イエロー
  "#95E1D3", // ライトグリーン
  "#F38181", // ピーチ
  "#AA96DA", // ラベンダー
];

const CONTAMINATION_KEYWORDS: Record<string, string[]> = {
  raw_meat: ["肉", "牛肉", "豚肉", "鶏肉", "ひき肉", "合いびき", "バラ肉", "ロース", "もも肉"],
  raw_fish: ["魚", "刺身", "サーモン", "マグロ", "エビ", "イカ", "貝"],
  vegetables: [
    "野菜",
    "じゃがいも",
    "にんじん",
    "玉ねぎ",
    "キャベツ",
    "レタス",
    "トマト",
    "きゅうり",
    "ピーマン",
    "ネギ",
    "長ネギ",
    "ほうれん草",
    "人参",
  ],
};

const WASH_DURATION_MIN = 2;

// ─── LLM Step Resource ─────────────────────────────

interface StepResource {
  step_index: number;
  step_description: string;
  duration: number;
  uses_stove: boolean;
  uses_cutting_board: boolean;
  requires_attention: boolean;
  tips?: string;
}

/**
 * VPS APIでレシピの各工程を解析・サブステップに分割
 * (scheduler.py:54-127 の analyze_recipe_with_llm を移植)
 */
async function analyzeRecipeWithLLM(
  recipeName: string,
  ingredients: string[],
  steps: Array<{ text: string }>,
): Promise<StepResource[]> {
  const useVps = shouldUseServerProxy();

  const stepsText = steps.map((s, i) => `${i + 1}. ${stripHtmlInline(s.text)}`).join("\n");
  const ingredientsText = ingredients.join(", ");

  const prompt = `レシピの各工程を解析し、必要に応じて細かいサブステップに分割してください。

レシピ名: ${recipeName}
材料: ${ingredientsText}
工程:
${stepsText}

## 重要：工程の分割ルール

1つの工程に複数の作業が含まれている場合、必ず分割してください：

【分割が必要な例】
- 「じゃがいもを切って茹でる（15分）」→ 分割：
  1. じゃがいもを切る（2分、手動、まな板使用）
  2. 鍋に入れて火にかける（1分、手動、コンロ使用）
  3. 茹でる（10分、放置、コンロ使用）
  4. 水を切ってザルにあげる（2分、手動）

- 「野菜を炒めて煮込む（20分）」→ 分割：
  1. 野菜を炒める（5分、手動、コンロ使用）
  2. 煮込む（15分、放置、コンロ使用）

## リソース判断基準

- uses_stove: コンロを使うか（炒める、煮る、焼く、沸かす、茹でる等）
- uses_cutting_board: まな板を使うか（切る、刻む、みじん切り等）
- requires_attention: 人の手が必要か
  - true: 切る、炒める、混ぜる、材料を入れる、火にかける、取り出す、盛り付け等
  - false: 煮込み中、蒸らし中、茹で中（放置して待つだけの時間）

## 出力形式

step_indexは分割後の連番（0から開始）にしてください。
各工程にtipsフィールドを追加し、その工程での注意点・コツ・失敗しやすいポイントを短く記載してください。
JSONの配列のみを出力してください。マークダウンのコードブロックは不要です。

[
  {
    "step_index": 0,
    "step_description": "工程の説明（短く具体的に）",
    "duration": 分数,
    "uses_stove": true/false,
    "uses_cutting_board": true/false,
    "requires_attention": true/false,
    "tips": "この工程の注意点やコツ（1文で簡潔に）"
  }
]`;

  if (useVps) {
    const data = await postJsonVps<{ steps: StepResource[] }>("/vps/scheduler/analyze-recipe", {
      prompt,
    });
    return data.steps;
  }

  const data = await callAnthropicMessages({
    maxTokens: 2048,
    messages: [{ role: "user", content: String(prompt ?? "") }],
  });

  const text = data.content?.[0]?.text ?? "";
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1) {
    throw new Error("No JSON array in response");
  }
  return JSON.parse(text.slice(start, end + 1)) as StepResource[];
}

// ─── Step Classification ────────────────────────────

/**
 * ステップテキストからリソース要件を判定
 * scheduler.py:390-397 のフォールバックロジック移植
 */
function classifyStep(text: string): {
  uses_stove: boolean;
  uses_cutting_board: boolean;
  requires_attention: boolean;
} {
  const clean = stripHtmlInline(text);
  return {
    uses_stove: /[焼炒煮沸茹蒸]/.test(clean) || /コンロ|火にかけ|フライパン|鍋/.test(clean),
    uses_cutting_board: /[切刻]/.test(clean) || /みじん/.test(clean),
    requires_attention: !/煮込|蒸らし|放置|浸[しけ]|冷ま/.test(clean),
  };
}

/**
 * タスクの食材カテゴリ判定 (hygiene.py:34-51)
 */
function classifyContamination(description: string): string {
  const lower = description.toLowerCase();
  for (const [category, keywords] of Object.entries(CONTAMINATION_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) return category;
    }
  }
  return "other";
}

// ─── Greedy Scheduler ───────────────────────────────

type TimeRange = [number, number];

function isResourceAvailable(
  usageList: TimeRange[],
  start: number,
  end: number,
  limit: number,
): boolean {
  let count = 0;
  for (const [s, e] of usageList) {
    if (!(end <= s || start >= e)) count++;
  }
  return count < limit;
}

/**
 * 貪欲法スケジューリング (scheduler.py:130-232)
 */
function greedySchedule(allTasks: SchedulerTask[], stoveBurners: number): SchedulerTask[] {
  // レシピごとにグループ化
  const tasksByRecipe = new Map<string, SchedulerTask[]>();
  for (const task of allTasks) {
    const list = tasksByRecipe.get(task.recipe_id) ?? [];
    list.push(task);
    tasksByRecipe.set(task.recipe_id, list);
  }

  // 各レシピのタスクをステップ順にソート
  for (const [, tasks] of tasksByRecipe) {
    tasks.sort((a, b) => a.step_index - b.step_index);
  }

  // リソース使用状況
  const stoveUsage: TimeRange[] = [];
  const cuttingBoardUsage: TimeRange[] = [];
  const attentionUsage: TimeRange[] = [];

  // 各レシピの進捗
  const nextTaskIdx = new Map<string, number>();
  const recipeEndTimes = new Map<string, number>();
  for (const rid of tasksByRecipe.keys()) {
    nextTaskIdx.set(rid, 0);
    recipeEndTimes.set(rid, 0);
  }

  const scheduled: SchedulerTask[] = [];

  // 全タスクがスケジュールされるまで
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

    for (const [recipeId, tasks] of tasksByRecipe) {
      const idx = nextTaskIdx.get(recipeId) ?? 0;
      if (idx >= tasks.length) continue;

      const task = tasks[idx];
      const earliestStart = recipeEndTimes.get(recipeId) ?? 0;

      // 最早開始時刻を探索 (上限500分)
      for (let tryStart = earliestStart; tryStart < earliestStart + 500; tryStart++) {
        const end = tryStart + task.duration;

        if (task.uses_stove && !isResourceAvailable(stoveUsage, tryStart, end, stoveBurners)) {
          continue;
        }
        if (task.uses_cutting_board && !isResourceAvailable(cuttingBoardUsage, tryStart, end, 1)) {
          continue;
        }
        if (task.requires_attention && !isResourceAvailable(attentionUsage, tryStart, end, 1)) {
          continue;
        }

        if (tryStart < bestStart) {
          bestTask = task;
          bestStart = tryStart;
          bestRecipeId = recipeId;
        }
        break;
      }
    }

    if (!bestTask || bestRecipeId === null) break;

    bestTask.start_time = bestStart;
    const endTime = bestStart + bestTask.duration;

    if (bestTask.uses_stove) stoveUsage.push([bestStart, endTime]);
    if (bestTask.uses_cutting_board) cuttingBoardUsage.push([bestStart, endTime]);
    if (bestTask.requires_attention) attentionUsage.push([bestStart, endTime]);

    recipeEndTimes.set(bestRecipeId, endTime);
    nextTaskIdx.set(bestRecipeId, (nextTaskIdx.get(bestRecipeId) ?? 0) + 1);
    scheduled.push(bestTask);
  }

  return scheduled;
}

// ─── Hygiene Correction ─────────────────────────────

/**
 * 洗い物タスクを挿入すべき位置を特定 (hygiene.py:54-98)
 */
function findWashInsertions(
  tasks: SchedulerTask[],
): Array<{ beforeIndex: number; reason: string }> {
  const sorted = [...tasks].sort((a, b) => a.start_time - b.start_time);
  const insertions: Array<{ beforeIndex: number; reason: string }> = [];

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
      (currentContamination === "raw_meat" || currentContamination === "raw_fish") &&
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
 * 衛生補正を適用 (hygiene.py:101-180)
 */
function applyHygieneCorrection(tasks: SchedulerTask[]): SchedulerTask[] {
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
        uses_stove: false,
        uses_cutting_board: false,
        requires_attention: true,
        start_time: task.start_time + totalDelay,
        color: task.color,
        task_type: "wash",
        contamination: "none",
        tips: "食中毒防止のため、しっかり洗いましょう",
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

// ─── Entry Point ────────────────────────────────────

/**
 * ルールベースでタスクを構築（LLMフォールバック用）
 */
function buildTasksFromGantt(recipe: Recipe, color: string): SchedulerTask[] {
  const steps: Array<{ text: string }> = recipe.instruction_steps?.length
    ? recipe.instruction_steps.map((s) => ({ text: s.text }))
    : (recipe.instructions ?? []).map((text) => ({ text }));

  const gantt = buildRecipeGantt(recipe.id, steps);

  return gantt.tasks.map((ganttTask) => {
    const classified = classifyStep(ganttTask.source_text);
    const description = stripHtmlInline(ganttTask.source_text);
    return {
      recipe_id: recipe.id,
      recipe_name: recipe.name,
      step_index: ganttTask.step_index,
      step_description: description,
      duration: ganttTask.duration_min,
      uses_stove: classified.uses_stove,
      uses_cutting_board: classified.uses_cutting_board,
      requires_attention: classified.requires_attention,
      start_time: 0,
      color,
      task_type: classified.uses_stove
        ? classified.requires_attention
          ? "cook_active"
          : "cook_passive"
        : "prep",
      contamination: classified.uses_cutting_board ? classifyContamination(description) : "none",
      tips: "",
    };
  });
}

/**
 * LLMでタスクを構築
 */
async function buildTasksFromLLM(recipe: Recipe, color: string): Promise<SchedulerTask[]> {
  const ingredients = recipe.ingredients ?? [];
  const steps: Array<{ text: string }> = recipe.instruction_steps?.length
    ? recipe.instruction_steps.map((s) => ({ text: s.text }))
    : (recipe.instructions ?? []).map((text) => ({ text }));

  const stepResources = await analyzeRecipeWithLLM(recipe.name, ingredients, steps);

  return stepResources.map((sr) => {
    const needsAttention = sr.requires_attention || sr.step_index === 0;
    return {
      recipe_id: recipe.id,
      recipe_name: recipe.name,
      step_index: sr.step_index,
      step_description: sr.step_description,
      duration: sr.duration,
      uses_stove: sr.uses_stove,
      uses_cutting_board: sr.uses_cutting_board,
      requires_attention: needsAttention,
      start_time: 0,
      color,
      task_type: sr.uses_stove ? (needsAttention ? "cook_active" : "cook_passive") : "prep",
      contamination: sr.uses_cutting_board ? classifyContamination(sr.step_description) : "none",
      tips: sr.tips ?? "",
    };
  });
}

/**
 * 複数レシピをスケジューリング
 *
 * VPS APIが利用可能ならLLMで工程分析、失敗時はルールベースにフォールバック
 *
 * @param recipes レシピ配列
 * @param stoveBurners コンロ口数
 * @param algorithm スケジューリングアルゴリズム
 */
export async function scheduleMultipleRecipes(
  recipes: Recipe[],
  stoveBurners: number,
  algorithm: SchedulerAlgorithmType = "auto",
): Promise<MultiRecipeSchedule> {
  const useVps = shouldUseServerProxy();
  let useLLMInLocalFallback = useVps && algorithm !== "claude_e2e";

  // VPS API経由でスケジューリング（高度なアルゴリズムを使用）
  if (useVps && algorithm !== "greedy") {
    try {
      const recipeInputs = recipes.map((r) => ({
        id: r.id,
        name: r.name,
        ingredients: r.ingredients ?? [],
        steps: r.instruction_steps?.length
          ? r.instruction_steps.map((s) => ({ text: s.text }))
          : (r.instructions ?? []).map((text) => ({ text })),
      }));

      const result = await postJsonVps<{
        schedule: { tasks: any[]; total_time: number; algorithm_used: string };
      }>("/vps/scheduler/create-schedule", {
        recipes: recipeInputs,
        kitchen: {
          stove_burners: stoveBurners,
          cutting_boards: 1,
          cooks: 1,
        },
        options: {
          algorithm,
          use_llm_analysis: true,
          hygiene_correction: true,
        },
      });

      return {
        tasks: result.schedule.tasks.map((t) => ({
          recipe_id: t.recipe_id,
          recipe_name: t.recipe_name,
          step_index: t.step_index,
          step_description: t.description,
          duration: t.duration,
          uses_stove: t.uses_stove,
          uses_cutting_board: t.uses_cutting_board,
          requires_attention: t.requires_attention,
          start_time: t.start_time,
          color: t.color,
          task_type: t.task_type,
          contamination: "none",
          tips: t.tips ?? "",
        })),
        total_time: result.schedule.total_time,
        algorithm_used: result.schedule.algorithm_used,
      };
    } catch (e) {
      console.warn("VPS scheduler API failed, using local fallback:", e);
      // VPS経由の失敗時はローカルのルールベースへフォールバック
      useLLMInLocalFallback = false;
    }
  }

  // ローカルフォールバック: greedy のみ
  const allTasks: SchedulerTask[] = [];
  const useLLM = useLLMInLocalFallback;

  for (let rIdx = 0; rIdx < recipes.length; rIdx++) {
    const recipe = recipes[rIdx];
    const color = RECIPE_COLORS[rIdx % RECIPE_COLORS.length];

    if (useLLM) {
      try {
        const tasks = await buildTasksFromLLM(recipe, color);
        allTasks.push(...tasks);
        continue;
      } catch (e) {
        console.warn(`LLM analysis failed for ${recipe.name}, using fallback:`, e);
      }
    }
    // フォールバック: ルールベース
    allTasks.push(...buildTasksFromGantt(recipe, color));
  }

  // グリーディスケジューリング
  const scheduled = greedySchedule(allTasks, stoveBurners);

  // 洗い物補正
  const corrected = applyHygieneCorrection(scheduled);

  const totalTime =
    corrected.length > 0 ? Math.max(...corrected.map((t) => t.start_time + t.duration)) : 0;

  return {
    tasks: corrected,
    total_time: totalTime,
    algorithm_used: useLLM ? "greedy+hygiene+llm" : "greedy+hygiene",
  };
}
