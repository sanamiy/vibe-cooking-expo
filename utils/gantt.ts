export interface GanttTask {
  task_id: string;
  step_index: number;
  label: string;
  source_text: string;
  start_min: number;
  duration_min: number;
  end_min: number;
  requires_timer: boolean;
  timer_minutes: number | null;
  confidence: number;
  depends_on: string[];
}

export interface RecipeGanttData {
  version: 1;
  recipe_id: string;
  total_estimated_minutes: number;
  tasks: GanttTask[];
  generation: {
    method: 'llm-assisted-rule-based';
    generated_at: string;
  };
}

const MINUTE_PATTERNS: RegExp[] = [/([\d]+)\s*[〜~\-]\s*([\d]+)\s*分/g, /([\d]+)\s*分(?:間)?/g];
const SECOND_PATTERN = /([\d]+)\s*秒/g;
const FALLBACK_BY_ACTION: Array<{ pattern: RegExp; minutes: number }> = [
  { pattern: /(切る|刻む|むく|下ごしらえ|準備)/, minutes: 4 },
  { pattern: /(混ぜる|合わせる|こねる|ほぐす)/, minutes: 3 },
  { pattern: /(炒める|焼く)/, minutes: 6 },
  { pattern: /(煮る|ゆでる|蒸す|弱火|中火|強火)/, minutes: 8 },
  { pattern: /(盛る|仕上げ|散らす)/, minutes: 2 },
];

const stripHtml = (text: string) => text.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, ' ').trim();
const toHalfWidth = (text: string) => text.replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xfee0));

export const parseStepDuration = (rawText: string) => {
  const text = toHalfWidth(stripHtml(rawText));
  let totalMinutes = 0;
  let timerMinutes = 0;

  for (const pattern of MINUTE_PATTERNS) {
    pattern.lastIndex = 0;
    let match = pattern.exec(text);
    while (match) {
      if (match[2]) {
        const avg = Math.max(1, Math.round((Number(match[1]) + Number(match[2])) / 2));
        totalMinutes += avg;
        timerMinutes += avg;
      } else if (match[1]) {
        const minutes = Number(match[1]);
        totalMinutes += minutes;
        timerMinutes += minutes;
      }
      match = pattern.exec(text);
    }
  }

  SECOND_PATTERN.lastIndex = 0;
  let secondMatch = SECOND_PATTERN.exec(text);
  while (secondMatch) {
    const toMinutes = Math.max(1, Math.round(Number(secondMatch[1]) / 60));
    totalMinutes += toMinutes;
    timerMinutes += toMinutes;
    secondMatch = SECOND_PATTERN.exec(text);
  }

  if (totalMinutes > 0) return { estimatedMinutes: totalMinutes, hasTimer: true, timerMinutes, confidence: 0.9 };
  const fallback = FALLBACK_BY_ACTION.find((rule) => rule.pattern.test(text));
  if (fallback) return { estimatedMinutes: fallback.minutes, hasTimer: false, timerMinutes: null, confidence: 0.6 };
  return { estimatedMinutes: 3, hasTimer: false, timerMinutes: null, confidence: 0.45 };
};

const makeStepLabel = (text: string) => toHalfWidth(stripHtml(text)).replace(/^（\d+）/, '').trim().slice(0, 26) || '調理ステップ';

export const buildRecipeGantt = (recipeId: string, steps: Array<{ text: string }>): RecipeGanttData => {
  let cursor = 0;
  const tasks: GanttTask[] = steps.map((step, index) => {
    const parsed = parseStepDuration(step.text);
    const start = cursor;
    const end = start + parsed.estimatedMinutes;
    cursor = end;
    return {
      task_id: `${recipeId}-s${index + 1}`,
      step_index: index + 1,
      label: makeStepLabel(step.text),
      source_text: step.text,
      start_min: start,
      duration_min: parsed.estimatedMinutes,
      end_min: end,
      requires_timer: parsed.hasTimer,
      timer_minutes: parsed.timerMinutes,
      confidence: parsed.confidence,
      depends_on: index === 0 ? [] : [`${recipeId}-s${index}`],
    };
  });

  return {
    version: 1,
    recipe_id: recipeId,
    total_estimated_minutes: cursor,
    tasks,
    generation: { method: 'llm-assisted-rule-based', generated_at: new Date().toISOString() },
  };
};
