/**
 * Scheduler API Types
 */

// ─── Skill Levels ────────────────────────────────────

export type SkillLevel = "beginner" | "intermediate" | "expert";

export const SKILL_MULTIPLIERS: Record<SkillLevel, number> = {
  beginner: 1.5,
  intermediate: 1.0,
  expert: 0.8,
};

// ─── Request Types ───────────────────────────────────

export interface RecipeInput {
  id: string;
  name: string;
  category?: string;
  ingredients: string[];
  steps: Array<{ text: string; duration_hint?: number }>;
}

export interface KitchenConfig {
  stove_burners: number;
  cutting_boards: number;
  cooks: number;
  cook_skills?: SkillLevel[];
}

export interface ScheduleOptions {
  algorithm?: AlgorithmType;
  sync_tolerance?: number;
  sync_weight?: number;
  hygiene_correction?: boolean;
  use_llm_analysis?: boolean;
}

export type AlgorithmType =
  | "greedy"
  | "critical_path"
  | "genetic"
  | "backward"
  | "astar"
  | "auto";

export interface ScheduleRequest {
  recipes: RecipeInput[];
  kitchen: KitchenConfig;
  options?: ScheduleOptions;
}

// ─── Internal Task Type ──────────────────────────────

export interface SchedulerTask {
  recipe_id: string;
  recipe_name: string;
  step_index: number;
  step_description: string;
  duration: number;
  original_duration: number;
  uses_stove: boolean;
  uses_cutting_board: boolean;
  requires_attention: boolean;
  start_time: number;
  color: string;
  task_type: TaskType;
  contamination: string;
  tips: string;
  assigned_cook: number;
}

export type TaskType = "prep" | "cook_active" | "cook_passive" | "wash";

// ─── Response Types ──────────────────────────────────

export interface ScheduledTask {
  task_id: string;
  recipe_id: string;
  recipe_name: string;
  step_index: number;
  description: string;
  start_time: number;
  duration: number;
  end_time: number;
  uses_stove: boolean;
  uses_cutting_board: boolean;
  requires_attention: boolean;
  assigned_cook?: number;
  task_type: TaskType;
  color: string;
  tips?: string;
}

export interface EatingWindow {
  recipe_id: string;
  recipe_name: string;
  eat_min: number;
  eat_max: number;
  reason: string;
  temperature_type: "hot" | "warm" | "cold";
}

export interface ScheduleMetrics {
  computation_time_ms: number;
  sync_variance: number;
  parallel_windows: number;
  recipe_end_times: Record<string, number>;
}

export interface ScheduleResponse {
  schedule: {
    tasks: ScheduledTask[];
    total_time: number;
    algorithm_used: string;
  };
  eating_windows: EatingWindow[];
  metrics: ScheduleMetrics;
}

// ─── Constants ───────────────────────────────────────

export const RECIPE_COLORS = [
  "#FF6B6B", // コーラルピンク
  "#4ECDC4", // ミントグリーン
  "#FFE66D", // イエロー
  "#95E1D3", // ライトグリーン
  "#F38181", // ピーチ
  "#AA96DA", // ラベンダー
];

export const CONTAMINATION_KEYWORDS: Record<string, string[]> = {
  raw_meat: [
    "肉", "牛肉", "豚肉", "鶏肉", "ひき肉", "合いびき",
    "バラ肉", "ロース", "もも肉",
  ],
  raw_fish: ["魚", "刺身", "サーモン", "マグロ", "エビ", "イカ", "貝"],
  vegetables: [
    "野菜", "じゃがいも", "にんじん", "玉ねぎ", "キャベツ",
    "レタス", "トマト", "きゅうり", "ピーマン", "ネギ",
    "長ネギ", "ほうれん草", "人参",
  ],
};

export const WASH_DURATION_MIN = 2;
