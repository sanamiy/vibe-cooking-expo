const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { URL } = require("node:url");

// Scheduler module (compiled from TypeScript)
let scheduler = null;
try {
  scheduler = require("./dist/index.js");
} catch (e) {
  console.warn("Scheduler module not found. Run 'npm run build' first.");
}

function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(data),
  });
  res.end(data);
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

async function readRaw(req, maxBytes) {
  return await new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (c) => {
      const buf = Buffer.isBuffer(c) ? c : Buffer.from(c);
      chunks.push(buf);
      total += buf.length;
      if (total > maxBytes) {
        reject(new Error("payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function readJson(req) {
  return await new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > 2_000_000) {
        reject(new Error("payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

async function callMistral(messages, { temperature, responseFormat } = {}) {
  const key = requireEnv("MISTRAL_API_KEY");
  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "mistral-small-latest",
      messages,
      temperature: temperature ?? 0.7,
      ...(responseFormat ? { response_format: responseFormat } : {}),
    }),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Mistral API error ${res.status}: ${text}`);
  return JSON.parse(text);
}

function collectText(value) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap((v) => collectText(v));
  if (!value || typeof value !== "object") return [];

  const out = [];
  if (typeof value.text === "string") out.push(value.text);
  if (typeof value.content === "string" || Array.isArray(value.content)) {
    out.push(...collectText(value.content));
  }
  return out;
}

function extractAssistantText(response) {
  const content = response?.choices?.[0]?.message?.content;
  return collectText(content)
    .map((s) => String(s).trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

async function callMistralAudioChat({
  audioBase64,
  prompt,
  model,
  temperature,
}) {
  const key = requireEnv("MISTRAL_API_KEY");
  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: model || "voxtral-mini-2507",
      temperature: temperature ?? 0,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "input_audio",
              input_audio: String(audioBase64 || ""),
            },
            {
              type: "text",
              text:
                prompt ||
                "音声の内容を日本語で簡潔に文字起こししてください。補足説明はせず、発話テキストのみを返してください。",
            },
          ],
        },
      ],
    }),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Mistral API error ${res.status}: ${text}`);
  return JSON.parse(text);
}

async function callAnthropic({
  system,
  messages,
  maxTokens,
  tools,
  toolChoice,
  temperature,
}) {
  const key = requireEnv("CLAUDE_API_KEY");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: maxTokens,
      ...(temperature != null ? { temperature } : {}),
      ...(system ? { system } : {}),
      ...(tools ? { tools } : {}),
      ...(toolChoice ? { tool_choice: toolChoice } : {}),
      messages,
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Anthropic API error ${res.status}: ${text}`);
  return JSON.parse(text);
}

async function callElevenLabs({ text }) {
  const key = requireEnv("ELEVENLABS_API_KEY");
  const voiceId = process.env.ELEVENLABS_VOICE_ID || "aFDSnmXyFHr0IRaw35mG";
  const modelId = process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2";
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": key,
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs API error ${res.status}: ${err}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++)
    binary += String.fromCharCode(bytes[i]);
  return Buffer.from(binary, "binary").toString("base64");
}

const FALLBACK_RECIPE_COLORS = [
  "#FF6B6B",
  "#4ECDC4",
  "#FFE66D",
  "#95E1D3",
  "#F38181",
  "#AA96DA",
];

const VALID_TASK_TYPES = new Set([
  "prep",
  "cook_active",
  "cook_passive",
  "wash",
]);

function stripHtmlInline(text) {
  return String(text ?? "")
    .replace(/<[^>]*>/g, "")
    .trim();
}

function extractJsonObject(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object in response");
  }
  return JSON.parse(text.slice(start, end + 1));
}

function toInt(
  value,
  fallback,
  { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {},
) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.trunc(n);
  return Math.min(max, Math.max(min, i));
}

function toBool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (v === "true") return true;
    if (v === "false") return false;
  }
  return fallback;
}

function normalizeTaskType(rawTaskType, usesStove, requiresAttention) {
  const taskType = String(rawTaskType ?? "").trim();
  if (VALID_TASK_TYPES.has(taskType)) return taskType;
  if (usesStove) return requiresAttention ? "cook_active" : "cook_passive";
  return "prep";
}

function countParallelWindows(tasks) {
  if (tasks.length === 0) return 0;
  const events = [];
  for (const t of tasks) {
    events.push([t.start_time, 1]);
    events.push([t.end_time, -1]);
  }
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  let current = 0;
  let windows = 0;
  for (const [, delta] of events) {
    const prev = current;
    current += delta;
    if (current > 1 && prev <= 1) windows++;
  }
  return windows;
}

function buildEatingWindows(recipes) {
  return recipes.map((r) => ({
    recipe_id: r.id,
    recipe_name: r.name,
    eat_min: 0,
    eat_max: 30,
    reason: "E2E Claude schedule (default window)",
    temperature_type: "warm",
  }));
}

function buildRecipeEndTimes(tasks) {
  const recipeEndTimes = {};
  for (const t of tasks) {
    recipeEndTimes[t.recipe_id] = Math.max(
      recipeEndTimes[t.recipe_id] ?? 0,
      t.end_time,
    );
  }
  return recipeEndTimes;
}

function buildClaudeE2EPrompt(recipes, kitchen) {
  const recipePayload = recipes.map((recipe) => ({
    id: recipe.id,
    name: recipe.name,
    ingredients: recipe.ingredients ?? [],
    steps: (recipe.steps ?? []).map((s, idx) => ({
      step_index: idx,
      text: stripHtmlInline(s.text),
      duration_hint: s.duration_hint ?? null,
    })),
  }));

  return `複数レシピの同時調理スケジュールを作成してください。

必須制約:
- 同じrecipe_id内では step_index の順序を守る
- 同時に使うコンロは ${kitchen.stove_burners} 口以内
- 同時に使うまな板は ${kitchen.cutting_boards} 枚以内
- requires_attention=true の同時タスクは ${kitchen.cooks} 人以内
- start_time/duration は整数分
- duration は1以上
- レシピIDは入力に存在する id のみ使用
- 複合工程は必ず分割する（1タスク=1アクション）
- 「〜して〜」「〜、〜」「〜してから〜」のような複数動作は2タスク以上に分割する
- 分割後の同一recipe内タスクは連続時刻で配置してよい（start_timeを詰める）
- 出力タスクは入力の工程より細かい粒度にすること（粗い要約禁止）

task_typeの定義:
- prep | cook_active | cook_passive | wash

出力はJSONオブジェクトのみ。コードブロック禁止。
{
  "tasks": [
    {
      "recipe_id": "入力にあるid",
      "recipe_name": "レシピ名",
      "step_index": 0,
      "description": "工程説明",
      "start_time": 0,
      "duration": 5,
      "uses_stove": false,
      "uses_cutting_board": true,
      "requires_attention": true,
      "task_type": "prep",
      "tips": "短いコツ"
    }
  ],
  "algorithm_used": "claude_e2e"
}

入力データ:
${JSON.stringify({ recipes: recipePayload, kitchen }, null, 2)}`;
}

function splitDescriptionClauses(description) {
  const normalized = stripHtmlInline(description).replace(/[。．]+/g, "。");
  if (!normalized) return [];

  const sentences = normalized
    .split("。")
    .map((s) => s.trim())
    .filter(Boolean);

  const clauses = [];
  for (const sentence of sentences) {
    const pieces = sentence
      .split(/(?:してから|し終えたら|したら|して|し、| then | and )/i)
      .map((s) => s.trim())
      .filter((s) => s.length >= 2);
    if (pieces.length > 0) clauses.push(...pieces);
  }

  return clauses.length > 0 ? clauses : [normalized];
}

function splitTaskConsecutively(task) {
  if (task.task_type === "wash") return [task];

  const clauses = splitDescriptionClauses(task.description);
  const canSplit = clauses.length >= 2 && task.duration >= 2;
  if (!canSplit) return [task];

  const partCount = Math.min(clauses.length, Math.min(task.duration, 4));
  const selected = clauses.slice(0, partCount);
  const base = Math.floor(task.duration / partCount);
  const remainder = task.duration % partCount;

  const parts = [];
  let cursor = task.start_time;
  for (let i = 0; i < partCount; i++) {
    const partDuration = base + (i < remainder ? 1 : 0);
    const duration = Math.max(1, partDuration);
    parts.push({
      ...task,
      description: selected[i],
      duration,
      end_time: cursor + duration,
    });
    cursor += duration;
  }
  return parts;
}

function applySequentialSplit(tasks) {
  const expanded = [];
  for (const task of tasks) {
    expanded.push(...splitTaskConsecutively(task));
  }

  expanded.sort(
    (a, b) => a.start_time - b.start_time || a.step_index - b.step_index,
  );

  const nextStepByRecipe = new Map();
  for (const task of expanded) {
    if (task.task_type === "wash") {
      task.step_index = -1;
      continue;
    }
    const next = nextStepByRecipe.get(task.recipe_id) ?? 0;
    task.step_index = next;
    nextStepByRecipe.set(task.recipe_id, next + 1);
  }

  for (let i = 0; i < expanded.length; i++) {
    expanded[i].task_id = `${expanded[i].recipe_id}-${i}`;
  }

  return expanded;
}

function parseClaudeE2ESchedule(text, recipes, computationTimeMs) {
  const parsed = extractJsonObject(text);
  const rawTasks = Array.isArray(parsed.tasks)
    ? parsed.tasks
    : Array.isArray(parsed.schedule?.tasks)
      ? parsed.schedule.tasks
      : [];
  if (rawTasks.length === 0) {
    throw new Error("No tasks array in Claude E2E response");
  }

  const recipeById = new Map(recipes.map((r) => [String(r.id), r]));
  const recipeColorById = new Map(
    recipes.map((r, idx) => [
      String(r.id),
      FALLBACK_RECIPE_COLORS[idx % FALLBACK_RECIPE_COLORS.length],
    ]),
  );

  const tasks = [];
  for (let i = 0; i < rawTasks.length; i++) {
    const raw = rawTasks[i] ?? {};
    let recipeId = String(raw.recipe_id ?? raw.recipeId ?? "");
    if (!recipeById.has(recipeId)) {
      const byName = recipes.find(
        (r) => r.name === String(raw.recipe_name ?? raw.recipeName ?? ""),
      );
      if (byName) recipeId = byName.id;
    }
    if (!recipeById.has(recipeId)) continue;

    const recipeName = String(recipeById.get(recipeId).name);
    const description = stripHtmlInline(
      raw.description ?? raw.step_description ?? "",
    );
    if (!description) continue;

    const startTime = toInt(raw.start_time ?? raw.startTime, 0, {
      min: 0,
      max: 24 * 60,
    });
    const duration = toInt(raw.duration, 5, { min: 1, max: 24 * 60 });
    const stepIndex = toInt(raw.step_index ?? raw.stepIndex, i, {
      min: -1,
      max: 10_000,
    });
    const usesStove = toBool(raw.uses_stove ?? raw.usesStove, false);
    const usesCuttingBoard = toBool(
      raw.uses_cutting_board ?? raw.usesCuttingBoard,
      false,
    );
    const requiresAttention = toBool(
      raw.requires_attention ?? raw.requiresAttention,
      true,
    );
    const taskType = normalizeTaskType(
      raw.task_type ?? raw.taskType,
      usesStove,
      requiresAttention,
    );
    const colorRaw = String(raw.color ?? "").trim();
    const color = /^#[0-9A-Fa-f]{6}$/.test(colorRaw)
      ? colorRaw
      : (recipeColorById.get(recipeId) ?? FALLBACK_RECIPE_COLORS[0]);
    const tips = String(raw.tips ?? "").trim();
    const assignedCook = toInt(raw.assigned_cook ?? raw.assignedCook, -1, {
      min: -1,
      max: 100,
    });

    tasks.push({
      task_id: `${recipeId}-${tasks.length}`,
      recipe_id: recipeId,
      recipe_name: recipeName,
      step_index: stepIndex,
      description,
      start_time: startTime,
      duration,
      end_time: startTime + duration,
      uses_stove: usesStove,
      uses_cutting_board: usesCuttingBoard,
      requires_attention: requiresAttention,
      assigned_cook: assignedCook >= 0 ? assignedCook : undefined,
      task_type: taskType,
      color,
      tips: tips || undefined,
    });
  }

  if (tasks.length === 0) {
    throw new Error("Claude E2E response tasks were all invalid");
  }

  const splitTasks = applySequentialSplit(tasks);
  splitTasks.sort(
    (a, b) => a.start_time - b.start_time || a.step_index - b.step_index,
  );

  const totalTime = Math.max(...splitTasks.map((t) => t.end_time), 0);
  const recipeEndTimes = buildRecipeEndTimes(splitTasks);
  const endTimes = Object.values(recipeEndTimes);
  const syncVariance =
    endTimes.length > 1 ? Math.max(...endTimes) - Math.min(...endTimes) : 0;
  const algorithmUsed = String(
    parsed.algorithm_used ?? parsed.schedule?.algorithm_used ?? "claude_e2e",
  );

  return {
    schedule: {
      tasks: splitTasks,
      total_time: totalTime,
      algorithm_used: algorithmUsed,
    },
    eating_windows: buildEatingWindows(recipes),
    metrics: {
      computation_time_ms: computationTimeMs,
      sync_variance: syncVariance,
      parallel_windows: countParallelWindows(splitTasks),
      recipe_end_times: recipeEndTimes,
    },
  };
}

const AGENTIC_STORE_FILE = path.join(__dirname, "agentic-schedules.json");
const AGENTIC_ALGORITHMS = [
  "auto",
  "greedy",
  "genetic",
  "critical_path",
  "backward",
  "astar",
  "claude_e2e",
];

function ensureSchedulerLoaded() {
  if (!scheduler) {
    throw new Error(
      "Scheduler module not loaded. Run 'npm run build' in vps-api.",
    );
  }
}

function readAgenticStore() {
  try {
    const raw = fs.readFileSync(AGENTIC_STORE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.schedules) {
      return parsed;
    }
  } catch {
    // no-op
  }
  return { version: 1, schedules: {} };
}

function writeAgenticStore(store) {
  fs.writeFileSync(AGENTIC_STORE_FILE, JSON.stringify(store, null, 2) + "\n");
}

function buildAnalyzeRecipePrompt(recipe) {
  const stepsText = recipe.steps
    .map((s, i) => `${i + 1}. ${String(s.text ?? "").replace(/<[^>]*>/g, "")}`)
    .join("\n");
  const ingredientsText = (recipe.ingredients ?? []).join(", ");

  return `レシピの各工程を解析し、必要に応じて細かいサブステップに分割してください。

レシピ名: ${recipe.name}
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

## リソース判断基準

- uses_stove: コンロを使うか（炒める、煮る、焼く、沸かす、茹でる等）
- uses_cutting_board: まな板を使うか（切る、刻む、みじん切り等）
- requires_attention: 人の手が必要か
  - true: 切る、炒める、混ぜる、材料を入れる、火にかける、取り出す、盛り付け等
  - false: 煮込み中、蒸らし中、茹で中（放置して待つだけの時間）

## 出力形式

JSONの配列のみを出力してください。

[
  {
    "step_index": 0,
    "step_description": "工程の説明",
    "duration": 分数,
    "uses_stove": true/false,
    "uses_cutting_board": true/false,
    "requires_attention": true/false,
    "tips": "この工程の注意点やコツ"
  }
]`;
}

async function analyzeRecipesWithLLM(recipes) {
  const analyzedRecipes = [];
  for (const recipe of recipes) {
    try {
      const prompt = buildAnalyzeRecipePrompt(recipe);
      const data = await callAnthropic({
        maxTokens: 2048,
        messages: [{ role: "user", content: prompt }],
      });

      const text = data.content?.[0]?.text ?? "";
      const start = text.indexOf("[");
      const end = text.lastIndexOf("]");
      if (start !== -1 && end !== -1) {
        const steps = JSON.parse(text.slice(start, end + 1));
        analyzedRecipes.push({ recipeId: recipe.id, steps });
      }
    } catch (e) {
      console.warn(`LLM analysis failed for ${recipe.name}:`, e?.message ?? e);
    }
  }
  return analyzedRecipes;
}

async function runCreateSchedule({ recipes, kitchen, options }) {
  const startedAt = Date.now();

  if (options?.algorithm === "claude_e2e") {
    try {
      const prompt = buildClaudeE2EPrompt(recipes, kitchen);
      const data = await callAnthropic({
        maxTokens: 4096,
        messages: [{ role: "user", content: prompt }],
      });
      const text = data.content?.[0]?.text ?? "";
      return parseClaudeE2ESchedule(text, recipes, Date.now() - startedAt);
    } catch (e) {
      console.warn(
        `Claude E2E scheduling failed, fallback to deterministic scheduler: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      ensureSchedulerLoaded();
      const fallbackOptions = {
        ...options,
        algorithm: "auto",
        use_llm_analysis: false,
      };
      const fallback = await scheduler.createSchedule({
        recipes,
        kitchen,
        options: fallbackOptions,
      });
      fallback.schedule.algorithm_used = `${fallback.schedule.algorithm_used}+claude_e2e_fallback`;
      fallback.metrics.computation_time_ms = Date.now() - startedAt;
      return fallback;
    }
  }

  ensureSchedulerLoaded();
  const analyzedRecipes =
    options?.use_llm_analysis === false
      ? []
      : await analyzeRecipesWithLLM(recipes);

  return await scheduler.createSchedule(
    { recipes, kitchen, options },
    analyzedRecipes.length > 0 ? analyzedRecipes : undefined,
  );
}

function chooseAgentAlgorithm({
  recipes,
  kitchen,
  objective,
  algorithmCandidates,
  forceAlgorithm,
}) {
  const normalizedCandidates =
    Array.isArray(algorithmCandidates) && algorithmCandidates.length > 0
      ? algorithmCandidates
          .map((v) => String(v))
          .filter((v) => AGENTIC_ALGORITHMS.includes(v))
      : [...AGENTIC_ALGORITHMS];
  const candidates =
    normalizedCandidates.length > 0
      ? normalizedCandidates
      : [...AGENTIC_ALGORITHMS];

  const objectiveText = String(objective ?? "").toLowerCase();
  const forced = String(forceAlgorithm ?? "");
  if (candidates.includes(forced)) {
    return {
      algorithm: forced,
      reason: "force_algorithm が指定されました",
      candidates,
    };
  }

  const pick = (...preferred) => preferred.find((p) => candidates.includes(p));
  const recipeCount = Array.isArray(recipes) ? recipes.length : 0;
  const stoveBurners = Number(kitchen?.stove_burners ?? 1);

  if (objectiveText.match(/speed|fast|quick|短|速/)) {
    const algorithm = pick("greedy", "critical_path", "auto") ?? candidates[0];
    return {
      algorithm,
      reason: "速度重視のため高速アルゴリズムを選択",
      candidates,
    };
  }

  if (objectiveText.match(/sync|simult|同時|揃|完了タイミング/)) {
    const algorithm =
      pick("genetic", "backward", "critical_path", "auto") ?? candidates[0];
    return {
      algorithm,
      reason: "同時完成重視のため同期系アルゴリズムを選択",
      candidates,
    };
  }

  if (recipeCount <= 1) {
    const algorithm = pick("greedy", "critical_path", "auto") ?? candidates[0];
    return {
      algorithm,
      reason: "単一レシピのためシンプルなアルゴリズムを選択",
      candidates,
    };
  }

  if (recipeCount >= 3) {
    const algorithm = pick("genetic", "critical_path", "auto") ?? candidates[0];
    return {
      algorithm,
      reason: "複数レシピのため最適化寄りアルゴリズムを選択",
      candidates,
    };
  }

  if (stoveBurners <= 1) {
    const algorithm = pick("critical_path", "greedy", "auto") ?? candidates[0];
    return {
      algorithm,
      reason: "コンロ制約が強いため競合回避しやすいアルゴリズムを選択",
      candidates,
    };
  }

  const algorithm = pick("auto", "genetic", "greedy") ?? candidates[0];
  return {
    algorithm,
    reason: "デフォルト戦略でアルゴリズムを選択",
    candidates,
  };
}

function computeScheduleStats(tasks) {
  const normalized = [...tasks].map((task) => {
    const start = toInt(task.start_time, 0, { min: 0, max: 24 * 60 });
    const duration = toInt(task.duration, 1, { min: 1, max: 24 * 60 });
    const end = start + duration;
    return { ...task, start_time: start, duration, end_time: end };
  });
  normalized.sort(
    (a, b) => a.start_time - b.start_time || a.end_time - b.end_time,
  );

  const totalTime =
    normalized.length > 0 ? Math.max(...normalized.map((t) => t.end_time)) : 0;
  const recipeEndTimes = buildRecipeEndTimes(normalized);
  const endTimes = Object.values(recipeEndTimes);
  const syncVariance =
    endTimes.length > 1 ? Math.max(...endTimes) - Math.min(...endTimes) : 0;

  return {
    tasks: normalized,
    totalTime,
    recipeEndTimes,
    syncVariance,
    parallelWindows: countParallelWindows(normalized),
  };
}

function normalizeScheduleTask(raw, fallbackTaskId = `manual-${randomUUID()}`) {
  const start = toInt(raw.start_time ?? raw.startTime, 0, {
    min: 0,
    max: 24 * 60,
  });
  const duration = toInt(raw.duration, 1, { min: 1, max: 24 * 60 });
  const usesStove = toBool(raw.uses_stove ?? raw.usesStove, false);
  const usesCuttingBoard = toBool(
    raw.uses_cutting_board ?? raw.usesCuttingBoard,
    false,
  );
  const requiresAttention = toBool(
    raw.requires_attention ?? raw.requiresAttention,
    true,
  );
  const taskType = normalizeTaskType(
    raw.task_type ?? raw.taskType,
    usesStove,
    requiresAttention,
  );
  const colorRaw = String(raw.color ?? "").trim();
  return {
    task_id: String(raw.task_id ?? raw.taskId ?? fallbackTaskId),
    recipe_id: String(raw.recipe_id ?? raw.recipeId ?? "manual"),
    recipe_name: String(raw.recipe_name ?? raw.recipeName ?? "manual"),
    step_index: toInt(raw.step_index ?? raw.stepIndex, 0, {
      min: -1,
      max: 10_000,
    }),
    description: stripHtmlInline(raw.description ?? ""),
    start_time: start,
    duration,
    end_time: start + duration,
    uses_stove: usesStove,
    uses_cutting_board: usesCuttingBoard,
    requires_attention: requiresAttention,
    assigned_cook: raw.assigned_cook ?? raw.assignedCook,
    task_type: taskType,
    color: /^#[0-9A-Fa-f]{6}$/.test(colorRaw)
      ? colorRaw
      : FALLBACK_RECIPE_COLORS[0],
    tips: raw.tips ? String(raw.tips) : undefined,
  };
}

function applyTaskUpdates(existingTasks, updates) {
  const warnings = [];
  let tasks = existingTasks.map((t) => ({ ...t }));
  const removeIds = new Set(
    (updates?.remove_task_ids ?? []).map((id) => String(id)),
  );
  tasks = tasks.filter((t) => !removeIds.has(t.task_id));

  for (const patch of updates?.task_updates ?? []) {
    const targetId = String(patch.task_id ?? "");
    const idx = tasks.findIndex((t) => t.task_id === targetId);
    if (idx === -1) {
      warnings.push(`task_id not found: ${targetId}`);
      continue;
    }
    const prev = tasks[idx];
    const next = { ...prev };
    if ("start_time" in patch)
      next.start_time = toInt(patch.start_time, prev.start_time, {
        min: 0,
        max: 24 * 60,
      });
    if ("duration" in patch)
      next.duration = toInt(patch.duration, prev.duration, {
        min: 1,
        max: 24 * 60,
      });
    if ("description" in patch)
      next.description = stripHtmlInline(patch.description);
    if ("uses_stove" in patch)
      next.uses_stove = toBool(patch.uses_stove, prev.uses_stove);
    if ("uses_cutting_board" in patch)
      next.uses_cutting_board = toBool(
        patch.uses_cutting_board,
        prev.uses_cutting_board,
      );
    if ("requires_attention" in patch)
      next.requires_attention = toBool(
        patch.requires_attention,
        prev.requires_attention,
      );
    if ("task_type" in patch) {
      next.task_type = normalizeTaskType(
        patch.task_type,
        next.uses_stove,
        next.requires_attention,
      );
    }
    if ("tips" in patch)
      next.tips = patch.tips ? String(patch.tips) : undefined;
    next.end_time = next.start_time + next.duration;
    tasks[idx] = next;
  }

  for (const rawTask of updates?.add_tasks ?? []) {
    const normalized = normalizeScheduleTask(rawTask);
    tasks.push(normalized);
  }

  tasks.sort((a, b) => a.start_time - b.start_time || a.end_time - b.end_time);
  for (let i = 0; i < tasks.length; i++) {
    if (!tasks[i].task_id) tasks[i].task_id = `task-${i + 1}`;
    tasks[i].end_time = tasks[i].start_time + tasks[i].duration;
  }

  const nextStepByRecipe = new Map();
  for (const task of tasks) {
    if (task.task_type === "wash") {
      task.step_index = -1;
      continue;
    }
    const next = nextStepByRecipe.get(task.recipe_id) ?? 0;
    task.step_index = next;
    nextStepByRecipe.set(task.recipe_id, next + 1);
  }

  return { tasks, warnings };
}

function normalizeEvaluationCriteria(rawCriteria) {
  const criteria = {
    must_respect_kitchen_limits: true,
    max_total_time: null,
    max_sync_variance: null,
    min_parallel_windows: null,
    custom_rules: [],
  };

  if (typeof rawCriteria === "string") {
    const text = rawCriteria.trim();
    if (text) criteria.custom_rules.push(text);
    return criteria;
  }

  if (Array.isArray(rawCriteria)) {
    criteria.custom_rules = rawCriteria
      .map((v) => String(v ?? "").trim())
      .filter(Boolean);
    return criteria;
  }

  if (!rawCriteria || typeof rawCriteria !== "object") {
    return criteria;
  }

  if ("must_respect_kitchen_limits" in rawCriteria) {
    criteria.must_respect_kitchen_limits = toBool(
      rawCriteria.must_respect_kitchen_limits,
      true,
    );
  }

  if ("max_total_time" in rawCriteria) {
    const n = Number(rawCriteria.max_total_time);
    criteria.max_total_time = Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : null;
  }

  if ("max_sync_variance" in rawCriteria) {
    const n = Number(rawCriteria.max_sync_variance);
    criteria.max_sync_variance = Number.isFinite(n)
      ? Math.max(0, Math.trunc(n))
      : null;
  }

  if ("min_parallel_windows" in rawCriteria) {
    const n = Number(rawCriteria.min_parallel_windows);
    criteria.min_parallel_windows = Number.isFinite(n)
      ? Math.max(0, Math.trunc(n))
      : null;
  }

  const ruleTexts = [];
  const pushRule = (value) => {
    const text = String(value ?? "").trim();
    if (text) ruleTexts.push(text);
  };

  if (typeof rawCriteria.criteria_text === "string") {
    pushRule(rawCriteria.criteria_text);
  }

  if (Array.isArray(rawCriteria.criteria_rules)) {
    for (const rule of rawCriteria.criteria_rules) pushRule(rule);
  }

  if (Array.isArray(rawCriteria.custom_rules)) {
    for (const rule of rawCriteria.custom_rules) pushRule(rule);
  }

  if (Array.isArray(rawCriteria.rules)) {
    for (const rule of rawCriteria.rules) {
      if (typeof rule === "string") {
        pushRule(rule);
      } else if (rule && typeof rule === "object") {
        pushRule(rule.criterion ?? rule.text ?? rule.rule);
      }
    }
  }

  criteria.custom_rules = [...new Set(ruleTexts)];
  return criteria;
}

function findResourceViolations(tasks, kitchen) {
  const stoveLimit = toInt(kitchen?.stove_burners, 1, { min: 0, max: 100 });
  const boardLimit = toInt(kitchen?.cutting_boards, 1, { min: 0, max: 100 });
  const cooksLimit = toInt(kitchen?.cooks, 1, { min: 0, max: 100 });
  const totalTime = tasks.length > 0 ? Math.max(...tasks.map((t) => t.end_time), 0) : 0;

  const violations = [];
  for (let minute = 0; minute < totalTime; minute++) {
    let stoveUsed = 0;
    let boardUsed = 0;
    let attentionUsed = 0;

    for (const task of tasks) {
      if (!(task.start_time < minute + 1 && task.end_time > minute)) continue;
      if (task.uses_stove) stoveUsed++;
      if (task.uses_cutting_board) boardUsed++;
      if (task.requires_attention) attentionUsed++;
    }

    if (stoveUsed > stoveLimit) {
      violations.push({
        type: "stove_burners",
        minute,
        used: stoveUsed,
        limit: stoveLimit,
      });
    }
    if (boardUsed > boardLimit) {
      violations.push({
        type: "cutting_boards",
        minute,
        used: boardUsed,
        limit: boardLimit,
      });
    }
    if (attentionUsed > cooksLimit) {
      violations.push({
        type: "cooks_attention",
        minute,
        used: attentionUsed,
        limit: cooksLimit,
      });
    }
  }

  return violations;
}

function findStepOrderViolations(tasks) {
  const violations = [];
  const byRecipe = new Map();
  for (const task of tasks) {
    if (task.step_index < 0) continue;
    if (!byRecipe.has(task.recipe_id)) byRecipe.set(task.recipe_id, []);
    byRecipe.get(task.recipe_id).push(task);
  }

  for (const [recipeId, recipeTasks] of byRecipe.entries()) {
    const sorted = [...recipeTasks].sort((a, b) => {
      if (a.step_index !== b.step_index) return a.step_index - b.step_index;
      if (a.start_time !== b.start_time) return a.start_time - b.start_time;
      return a.end_time - b.end_time;
    });
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      if (curr.step_index > prev.step_index && curr.start_time < prev.end_time) {
        violations.push({
          recipe_id: recipeId,
          previous_task_id: prev.task_id,
          current_task_id: curr.task_id,
          previous_range: `${prev.start_time}-${prev.end_time}`,
          current_range: `${curr.start_time}-${curr.end_time}`,
        });
      }
    }
  }

  return violations;
}

function buildCriteriaResultsFromDeterministicChecks({
  criteria,
  stats,
  scheduleTasks,
  kitchen,
}) {
  const results = [];
  const blockers = [];

  const resourceViolations = criteria.must_respect_kitchen_limits
    ? findResourceViolations(scheduleTasks, kitchen)
    : [];
  const resourcePass = resourceViolations.length === 0;
  results.push({
    criterion: "キッチン制約を超えない",
    passed: resourcePass,
    reason: resourcePass
      ? "コンロ・まな板・注意タスク人数の上限を超えていません。"
      : `制約超過が ${resourceViolations.length} 箇所あります。`,
    source: "deterministic",
  });
  if (!resourcePass) {
    blockers.push(
      `キッチン制約違反: ${resourceViolations
        .slice(0, 3)
        .map((v) => `${v.type}@${v.minute}分(使用${v.used}/上限${v.limit})`)
        .join(", ")}`,
    );
  }

  const stepOrderViolations = findStepOrderViolations(scheduleTasks);
  const stepOrderPass = stepOrderViolations.length === 0;
  results.push({
    criterion: "同一レシピの工程順序を守る",
    passed: stepOrderPass,
    reason: stepOrderPass
      ? "工程順序違反は検出されませんでした。"
      : `工程順序違反が ${stepOrderViolations.length} 箇所あります。`,
    source: "deterministic",
  });
  if (!stepOrderPass) {
    blockers.push(
      `工程順序違反: ${stepOrderViolations
        .slice(0, 3)
        .map((v) => `${v.recipe_id} ${v.previous_range} -> ${v.current_range}`)
        .join(", ")}`,
    );
  }

  if (criteria.max_total_time != null) {
    const pass = stats.totalTime <= criteria.max_total_time;
    results.push({
      criterion: `総時間 <= ${criteria.max_total_time}分`,
      passed: pass,
      reason: `実測 ${stats.totalTime}分`,
      source: "deterministic",
    });
    if (!pass) blockers.push(`総時間超過: ${stats.totalTime}分`);
  }

  if (criteria.max_sync_variance != null) {
    const pass = stats.syncVariance <= criteria.max_sync_variance;
    results.push({
      criterion: `同時完成ばらつき <= ${criteria.max_sync_variance}分`,
      passed: pass,
      reason: `実測 ${stats.syncVariance}分`,
      source: "deterministic",
    });
    if (!pass) blockers.push(`同時完成ばらつき超過: ${stats.syncVariance}分`);
  }

  if (criteria.min_parallel_windows != null) {
    const pass = stats.parallelWindows >= criteria.min_parallel_windows;
    results.push({
      criterion: `並列ウィンドウ >= ${criteria.min_parallel_windows}`,
      passed: pass,
      reason: `実測 ${stats.parallelWindows}`,
      source: "deterministic",
    });
    if (!pass) blockers.push(`並列ウィンドウ不足: ${stats.parallelWindows}`);
  }

  return {
    results,
    blockers,
    resourceViolations,
    stepOrderViolations,
  };
}

function normalizeCriteriaResults(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const criterion = String(
        item?.criterion ?? item?.name ?? item?.rule ?? "",
      ).trim();
      if (!criterion) return null;
      return {
        criterion,
        passed: toBool(item?.passed, false),
        reason: String(item?.reason ?? item?.comment ?? ""),
        source: "llm",
      };
    })
    .filter(Boolean);
}

async function runScheduleEvaluationOneCall(args) {
  const scheduleId = String(args?.schedule_id ?? "");
  const providedSchedule = args?.schedule;
  const providedKitchen = args?.kitchen;
  const criteriaInput =
    args?.criteria ?? args?.criteria_text ?? args?.criteria_rules ?? {};
  const criteria = normalizeEvaluationCriteria(criteriaInput);
  const taskLimit = toInt(args?.task_limit_for_llm, 120, { min: 20, max: 500 });

  let resolvedSchedule = providedSchedule;
  let resolvedKitchen = providedKitchen;
  let resolvedScheduleId = scheduleId || null;

  if (scheduleId) {
    const store = readAgenticStore();
    const record = store.schedules[scheduleId];
    if (!record) throw new Error(`schedule not found: ${scheduleId}`);
    resolvedSchedule = record?.result?.schedule;
    resolvedKitchen = resolvedKitchen ?? record?.request?.kitchen;
  }

  if (!resolvedSchedule) {
    throw new Error("evaluate_schedule requires schedule_id or schedule");
  }

  const rawTasks = Array.isArray(resolvedSchedule?.tasks)
    ? resolvedSchedule.tasks
    : Array.isArray(resolvedSchedule?.schedule?.tasks)
      ? resolvedSchedule.schedule.tasks
      : [];
  if (rawTasks.length === 0) {
    throw new Error("schedule.tasks is empty");
  }

  const normalizedTasks = rawTasks.map((t, i) =>
    normalizeScheduleTask(t, `eval-${i + 1}`),
  );
  const stats = computeScheduleStats(normalizedTasks);
  const algorithmUsed = String(
    resolvedSchedule?.algorithm_used ??
      resolvedSchedule?.schedule?.algorithm_used ??
      "unknown",
  );

  const {
    results: deterministicResults,
    blockers: deterministicBlockers,
    resourceViolations,
    stepOrderViolations,
  } = buildCriteriaResultsFromDeterministicChecks({
    criteria,
    stats,
    scheduleTasks: stats.tasks,
    kitchen: resolvedKitchen ?? {},
  });

  let llmPayload = null;
  let llmError = null;
  if (criteria.custom_rules.length > 0) {
    const scheduleForLlm = stats.tasks.slice(0, taskLimit).map((t) => ({
      task_id: t.task_id,
      recipe_id: t.recipe_id,
      recipe_name: t.recipe_name,
      step_index: t.step_index,
      time: `${t.start_time}-${t.end_time}`,
      task_type: t.task_type,
      requires_attention: t.requires_attention,
      uses_stove: t.uses_stove,
      uses_cutting_board: t.uses_cutting_board,
      description: t.description,
    }));

    const system = `あなたはスケジュール評価エージェントです。
出力はJSONオブジェクトのみ。コードブロック禁止。
厳密に次の形式:
{
  "pass": true/false,
  "score": 0-100の整数,
  "summary": "全体評価",
  "criteria_results": [
    { "criterion": "基準文", "passed": true/false, "reason": "根拠" }
  ],
  "blockers": ["未達の重要項目"],
  "suggestions": ["改善案"]
}`;

    const prompt = {
      criteria: criteria.custom_rules,
      schedule_meta: {
        schedule_id: resolvedScheduleId,
        algorithm_used: algorithmUsed,
        total_time: stats.totalTime,
        task_count: stats.tasks.length,
        sync_variance: stats.syncVariance,
        parallel_windows: stats.parallelWindows,
      },
      kitchen: resolvedKitchen ?? null,
      deterministic_findings: {
        blockers: deterministicBlockers,
        resource_violations: resourceViolations.slice(0, 10),
        step_order_violations: stepOrderViolations.slice(0, 10),
      },
      tasks: scheduleForLlm,
      tasks_truncated: stats.tasks.length > taskLimit,
    };

    try {
      const data = await callAnthropic({
        system,
        maxTokens: 1200,
        temperature: 0,
        messages: [{ role: "user", content: JSON.stringify(prompt, null, 2) }],
      });
      const text = (Array.isArray(data?.content) ? data.content : [])
        .filter((c) => c?.type === "text")
        .map((c) => String(c?.text ?? ""))
        .join("\n")
        .trim();
      llmPayload = extractJsonObject(text);
    } catch (e) {
      llmError = e instanceof Error ? e.message : String(e);
    }
  }

  const llmCriteriaResults = normalizeCriteriaResults(llmPayload?.criteria_results);
  const llmBlockers = Array.isArray(llmPayload?.blockers)
    ? llmPayload.blockers.map((v) => String(v))
    : [];
  const llmSuggestions = Array.isArray(llmPayload?.suggestions)
    ? llmPayload.suggestions.map((v) => String(v))
    : [];
  const deterministicPass = deterministicResults.every((r) => r.passed);
  const llmPass = llmPayload
    ? toBool(llmPayload?.pass, false)
    : criteria.custom_rules.length > 0
      ? false
      : true;
  const pass = deterministicPass && llmPass;
  const score = llmPayload
    ? toInt(llmPayload?.score, pass ? 100 : 0, { min: 0, max: 100 })
    : toInt(
        Math.round(
          (deterministicResults.filter((r) => r.passed).length /
            Math.max(1, deterministicResults.length)) *
            100,
        ),
        pass ? 100 : 0,
        { min: 0, max: 100 },
      );

  const summary = llmPayload?.summary
    ? String(llmPayload.summary)
    : pass
      ? "評価基準を満たしています。"
      : "評価基準を満たしていません。";

  const blockers = [...deterministicBlockers, ...llmBlockers];
  if (llmError) blockers.push(`LLM評価失敗: ${llmError}`);
  const suggestions = llmSuggestions;
  if (!pass && suggestions.length === 0) {
    suggestions.push("未達基準を満たすように schedule を update して再評価してください。");
  }

  return {
    schedule_id: resolvedScheduleId,
    pass,
    score,
    summary,
    criteria_used: criteria,
    criteria_results: [...deterministicResults, ...llmCriteriaResults],
    blockers,
    suggestions,
    schedule_stats: {
      total_time: stats.totalTime,
      task_count: stats.tasks.length,
      algorithm_used: algorithmUsed,
      sync_variance: stats.syncVariance,
      parallel_windows: stats.parallelWindows,
    },
    diagnostics: {
      llm_called: criteria.custom_rules.length > 0,
      llm_error: llmError,
      resource_violations_count: resourceViolations.length,
      step_order_violations_count: stepOrderViolations.length,
    },
  };
}

const SCHEDULER_AGENT_TOOLS = [
  {
    name: "optimize_schedule",
    description:
      "利用可能なアルゴリズムから適切なものを選び、スケジュールを最適化して保存する。",
    input_schema: {
      type: "object",
      properties: {
        recipes: {
          type: "array",
          description: "レシピ配列",
        },
        kitchen: {
          type: "object",
          description: "キッチン制約",
        },
        objective: {
          type: "string",
          description: "最適化の狙い（例: 速度重視、同時完成重視）",
        },
        algorithm_candidates: {
          type: "array",
          items: { type: "string" },
          description: "選択候補アルゴリズム",
        },
        options: {
          type: "object",
          description: "スケジューラの追加オプション",
        },
        schedule_name: {
          type: "string",
          description: "保存名",
        },
      },
      required: ["recipes", "kitchen"],
    },
  },
  {
    name: "get_schedule",
    description: "保存済みスケジュールを取得する。",
    input_schema: {
      type: "object",
      properties: {
        schedule_id: { type: "string" },
        include_tasks: { type: "boolean" },
        task_limit: { type: "integer" },
      },
      required: ["schedule_id"],
    },
  },
  {
    name: "update_schedule",
    description:
      "保存済みスケジュールへ手動調整（更新・追加・削除）を適用する。",
    input_schema: {
      type: "object",
      properties: {
        schedule_id: { type: "string" },
        updates: {
          type: "object",
          properties: {
            task_updates: { type: "array" },
            add_tasks: { type: "array" },
            remove_task_ids: { type: "array", items: { type: "string" } },
          },
        },
      },
      required: ["schedule_id", "updates"],
    },
  },
  {
    name: "evaluate_schedule",
    description:
      "与えられた基準でスケジュールを評価し、pass/failと改善提案を返す（1回評価）。",
    input_schema: {
      type: "object",
      properties: {
        schedule_id: {
          type: "string",
          description: "保存済みスケジュールID（指定時はstoreから取得）",
        },
        schedule: {
          type: "object",
          description: "直接評価したいスケジュール（tasks配列を含む）",
        },
        kitchen: {
          type: "object",
          description: "キッチン制約（schedule直渡し時に推奨）",
        },
        criteria: {
          type: "object",
          description:
            "評価基準。max_total_time/max_sync_variance/min_parallel_windows/custom_rules など。",
        },
        criteria_text: {
          type: "string",
          description: "自然言語の評価基準（任意）",
        },
        criteria_rules: {
          type: "array",
          items: { type: "string" },
          description: "自然言語の評価基準一覧（任意）",
        },
        task_limit_for_llm: {
          type: "integer",
          description: "LLM評価へ渡す最大タスク数（20-500）",
        },
      },
    },
  },
];

async function agentToolOptimizeSchedule(args) {
  const {
    recipes,
    kitchen,
    objective,
    algorithm_candidates,
    options = {},
    schedule_name,
  } = args ?? {};

  if (!Array.isArray(recipes) || recipes.length === 0 || !kitchen) {
    throw new Error("optimize_schedule requires recipes and kitchen");
  }

  const selection = chooseAgentAlgorithm({
    recipes,
    kitchen,
    objective,
    algorithmCandidates: algorithm_candidates,
    forceAlgorithm: options?.force_algorithm,
  });

  const scheduleOptions = {
    ...options,
    algorithm: selection.algorithm,
  };
  if (scheduleOptions.algorithm === "claude_e2e") {
    scheduleOptions.use_llm_analysis = true;
  }

  const result = await runCreateSchedule({
    recipes,
    kitchen,
    options: scheduleOptions,
  });

  const now = new Date().toISOString();
  const scheduleId = randomUUID();
  const store = readAgenticStore();
  const record = {
    schedule_id: scheduleId,
    schedule_name: String(schedule_name ?? ""),
    objective: String(objective ?? ""),
    selected_algorithm: selection.algorithm,
    selection_reason: selection.reason,
    algorithm_candidates: selection.candidates,
    request: {
      recipes,
      kitchen,
      options: scheduleOptions,
    },
    result,
    version: 1,
    created_at: now,
    updated_at: now,
  };
  store.schedules[scheduleId] = record;
  writeAgenticStore(store);

  return {
    schedule_id: scheduleId,
    selected_algorithm: selection.algorithm,
    selection_reason: selection.reason,
    schedule_name: record.schedule_name,
    summary: {
      total_time: result?.schedule?.total_time ?? 0,
      task_count: result?.schedule?.tasks?.length ?? 0,
      algorithm_used: result?.schedule?.algorithm_used ?? selection.algorithm,
    },
  };
}

async function agentToolGetSchedule(args) {
  const scheduleId = String(args?.schedule_id ?? "");
  if (!scheduleId) throw new Error("get_schedule requires schedule_id");

  const includeTasks = args?.include_tasks !== false;
  const taskLimit = toInt(args?.task_limit, 200, { min: 1, max: 5_000 });
  const store = readAgenticStore();
  const record = store.schedules[scheduleId];
  if (!record) throw new Error(`schedule not found: ${scheduleId}`);

  const tasks = Array.isArray(record?.result?.schedule?.tasks)
    ? record.result.schedule.tasks
    : [];
  const limitedTasks = includeTasks ? tasks.slice(0, taskLimit) : undefined;

  return {
    schedule_id: scheduleId,
    version: record.version,
    schedule_name: record.schedule_name,
    selected_algorithm: record.selected_algorithm,
    updated_at: record.updated_at,
    schedule: {
      total_time: record?.result?.schedule?.total_time ?? 0,
      algorithm_used: record?.result?.schedule?.algorithm_used ?? "unknown",
      task_count: tasks.length,
      tasks: limitedTasks,
      tasks_truncated: includeTasks ? tasks.length > taskLimit : false,
    },
  };
}

async function agentToolUpdateSchedule(args) {
  const scheduleId = String(args?.schedule_id ?? "");
  const updates = args?.updates ?? {};
  if (!scheduleId) throw new Error("update_schedule requires schedule_id");

  const store = readAgenticStore();
  const record = store.schedules[scheduleId];
  if (!record) throw new Error(`schedule not found: ${scheduleId}`);

  const currentTasks = record?.result?.schedule?.tasks;
  if (!Array.isArray(currentTasks)) {
    throw new Error("stored schedule has invalid task format");
  }

  const { tasks, warnings } = applyTaskUpdates(currentTasks, updates);
  const stats = computeScheduleStats(tasks);
  const baseAlgorithm = String(
    record.result?.schedule?.algorithm_used ?? "manual",
  );
  const algorithmUsed = baseAlgorithm.includes("+manual_update")
    ? baseAlgorithm
    : `${baseAlgorithm}+manual_update`;

  record.result.schedule.tasks = stats.tasks;
  record.result.schedule.total_time = stats.totalTime;
  record.result.schedule.algorithm_used = algorithmUsed;
  record.result.metrics = {
    ...(record.result.metrics ?? {}),
    computation_time_ms: 0,
    sync_variance: stats.syncVariance,
    parallel_windows: stats.parallelWindows,
    recipe_end_times: stats.recipeEndTimes,
  };
  record.version = toInt(record.version, 1, { min: 1, max: 1_000_000 }) + 1;
  record.updated_at = new Date().toISOString();
  store.schedules[scheduleId] = record;
  writeAgenticStore(store);

  return {
    schedule_id: scheduleId,
    version: record.version,
    warnings,
    summary: {
      total_time: record?.result?.schedule?.total_time ?? 0,
      task_count: record?.result?.schedule?.tasks?.length ?? 0,
      algorithm_used: record?.result?.schedule?.algorithm_used ?? "manual",
    },
  };
}

async function agentToolEvaluateSchedule(args) {
  return await runScheduleEvaluationOneCall(args ?? {});
}

const SCHEDULER_AGENT_HANDLERS = {
  optimize_schedule: agentToolOptimizeSchedule,
  get_schedule: agentToolGetSchedule,
  update_schedule: agentToolUpdateSchedule,
  evaluate_schedule: agentToolEvaluateSchedule,
};

async function runSchedulerAgent({
  userRequest,
  recipes,
  kitchen,
  scheduleId,
  objective,
  algorithmCandidates,
  options,
  maxSteps,
}) {
  const requestText = String(userRequest ?? "").trim();
  if (!requestText) {
    throw new Error("user_request is required");
  }

  const stepsLimit = toInt(maxSteps, 8, { min: 1, max: 12 });
  const context = {
    recipes: Array.isArray(recipes) ? recipes : undefined,
    kitchen: kitchen ?? undefined,
    schedule_id: scheduleId ? String(scheduleId) : undefined,
    objective: objective ? String(objective) : undefined,
    algorithm_candidates: Array.isArray(algorithmCandidates)
      ? algorithmCandidates
      : undefined,
    options: options ?? undefined,
  };

  const system = `あなたはスケジューリング最適化エージェントです。
必ず tool calling を使って作業を進めてください。
利用可能ツール:
- optimize_schedule: スケジュール最適化と保存
- get_schedule: 保存済みスケジュール取得
- update_schedule: 保存済みスケジュールの手動調整
- evaluate_schedule: 評価基準に対する pass/fail 判定

ルール:
- 新規作成が必要なら optimize_schedule を呼ぶ
- 既存 schedule_id がある場合、内容確認には get_schedule を呼ぶ
- 手動調整依頼がある場合は update_schedule を呼ぶ
- 合否判定依頼がある場合は evaluate_schedule を呼ぶ
- evaluate_schedule で pass=true なら作業完了として最終回答する
- 最後は日本語で簡潔に結果を要約し、schedule_id と次アクションを示す`;

  const messages = [
    {
      role: "user",
      content: `ユーザー依頼:\n${requestText}\n\n初期コンテキスト:\n${JSON.stringify(context, null, 2)}`,
    },
  ];

  const trace = [];
  let finalText = "";

  for (let step = 1; step <= stepsLimit; step++) {
    const response = await callAnthropic({
      system,
      maxTokens: 1400,
      tools: SCHEDULER_AGENT_TOOLS,
      toolChoice: { type: "auto" },
      messages,
    });

    const content = Array.isArray(response?.content) ? response.content : [];
    const toolUses = content.filter((c) => c?.type === "tool_use");
    const text = content
      .filter((c) => c?.type === "text")
      .map((c) => String(c.text ?? ""))
      .join("\n")
      .trim();

    messages.push({ role: "assistant", content });

    if (toolUses.length === 0) {
      finalText = text;
      break;
    }

    const resultBlocks = [];
    for (const toolUse of toolUses) {
      const toolName = String(toolUse.name ?? "");
      const handler = SCHEDULER_AGENT_HANDLERS[toolName];
      let payload;
      if (!handler) {
        payload = { ok: false, error: `unknown tool: ${toolName}` };
      } else {
        try {
          const result = await handler(toolUse.input ?? {});
          payload = { ok: true, result };
        } catch (e) {
          payload = {
            ok: false,
            error: e instanceof Error ? e.message : String(e),
          };
        }
      }

      trace.push({
        step,
        tool: toolName,
        ok: !!payload.ok,
        schedule_id:
          payload?.result?.schedule_id ?? toolUse?.input?.schedule_id ?? null,
        error: payload.ok ? null : payload.error,
      });

      resultBlocks.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: JSON.stringify(payload),
      });
    }

    messages.push({
      role: "user",
      content: resultBlocks,
    });
  }

  const touchedScheduleIds = [
    ...new Set(trace.map((t) => t.schedule_id).filter(Boolean)),
  ];
  return {
    final_text: finalText || "処理を完了しました。",
    trace,
    schedule_ids: touchedScheduleIds,
  };
}

const server = http.createServer(async (req, res) => {
  setCors(res);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    const url = new URL(
      req.url || "/",
      `http://${req.headers.host || "localhost"}`,
    );
    const path = url.pathname;

    if (req.method === "GET" && path === "/vps/health") {
      json(res, 200, { ok: true });
      return;
    }

    if (req.method !== "POST") {
      json(res, 404, { error: "not found" });
      return;
    }

    if (path === "/vps/asr/transcribe") {
      const key = requireEnv("MISTRAL_API_KEY");
      const contentType = req.headers["content-type"];
      if (
        !contentType ||
        !String(contentType).startsWith("multipart/form-data")
      ) {
        json(res, 400, { error: "Expected multipart/form-data" });
        return;
      }

      const raw = await readRaw(req, 25_000_000);
      const upstream = await fetch(
        "https://api.mistral.ai/v1/audio/transcriptions",
        {
          method: "POST",
          headers: {
            "Content-Type": String(contentType),
            Authorization: `Bearer ${key}`,
          },
          body: raw,
        },
      );

      res.writeHead(upstream.status, {
        "Content-Type":
          upstream.headers.get("content-type") || "application/octet-stream",
        "Cache-Control": "no-store",
      });

      if (!upstream.body) {
        res.end();
        return;
      }

      const reader = upstream.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) res.write(Buffer.from(value));
      }
      res.end();
      return;
    }

    const body = await readJson(req);

    if (path === "/vps/ai/classify-intent") {
      const { userText, currentStep, prevStep, nextStep, recipeName } = body;
      const system = `あなたは調理アシスタントの意図分類器です。
ユーザーの発話を以下のラベルのいずれかに分類してください。
ラベル: next_step, previous_step, question, timer_status, end_session

${recipeName ? `料理名: ${recipeName}` : ""}
現在の工程: ${currentStep}
${prevStep ? `前の工程: ${prevStep}` : "（最初の工程です）"}
${nextStep ? `次の工程: ${nextStep}` : "（最後の工程です）"}

JSON形式で返してください: {"intent": "ラベル"}`;

      const data = await callMistral(
        [
          { role: "system", content: system },
          { role: "user", content: String(userText ?? "") },
        ],
        { temperature: 0, responseFormat: { type: "json_object" } },
      );

      const text = data.choices?.[0]?.message?.content ?? "{}";
      const parsed = JSON.parse(text);
      const valid = new Set([
        "next_step",
        "previous_step",
        "question",
        "timer_status",
        "end_session",
      ]);
      const intent = valid.has(parsed.intent) ? parsed.intent : "question";
      json(res, 200, { intent });
      return;
    }

    if (path === "/vps/audio/understand") {
      const { audioBase64, prompt, model, temperature } = body;
      if (!audioBase64 || typeof audioBase64 !== "string") {
        json(res, 400, { error: "audioBase64 is required" });
        return;
      }
      const data = await callMistralAudioChat({
        audioBase64,
        prompt,
        model,
        temperature,
      });
      const text = extractAssistantText(data);
      json(res, 200, { text });
      return;
    }

    if (path === "/vps/ai/answer-question") {
      const { userText, currentStep, stepProgress, history, recipeContext } =
        body;

      const recipeInfo = recipeContext
        ? `
料理名: ${recipeContext.recipeName}

【材料】
${(recipeContext.ingredients || []).map((ing) => `- ${ing}`).join("\n")}

【全工程】
${(recipeContext.allSteps || []).map((s, i) => `${i + 1}. ${s}`).join("\n")}
${
  recipeContext.stepTips?.length
    ? `\n【各工程の注意点・コツ】\n${recipeContext.stepTips.map((t, i) => `${i + 1}. ${t}`).join("\n")}`
    : ""
}`
        : "";

      const messages = [
        {
          role: "system",
          content: `あなたは料理中のユーザーを助ける調理アシスタントです。
手が塞がっているので、簡潔に（1-2文で）答えてください。
${recipeInfo}

現在の工程: ${currentStep}
進捗: ${stepProgress}`,
        },
        ...((history || []).slice(-10).map((h) => ({
          role: h.role,
          content: h.content,
        })) || []),
        { role: "user", content: String(userText ?? "") },
      ];

      const data = await callMistral(messages, { temperature: 0.7 });
      const answer = data.choices?.[0]?.message?.content ?? "";
      json(res, 200, { answer });
      return;
    }

    if (path === "/vps/ai/barge-in") {
      const {
        userText,
        interruptedSpeech,
        currentStep,
        stepProgress,
        history,
        recipeContext,
      } = body;

      const recipeInfo = recipeContext
        ? `\n料理名: ${recipeContext.recipeName}\n材料: ${(recipeContext.ingredients || []).join("、")}`
        : "";

      const system = `あなたは調理アシスタントです。ユーザーがあなたの発話中に割り込みました。
${recipeInfo}
あなたが話していた内容: 「${interruptedSpeech}」
現在の工程: ${currentStep}
進捗: ${stepProgress}

ユーザーの割り込み発話を見て判断してください:
- ユーザーが「うん」「はい」「わかった」等の相槌や、特に意味のない発話の場合 → 中断された説明の続きを自然に話してください
- ユーザーが質問や指示をしている場合 → その質問/指示に応えてください

JSON形式で返してください:
{"action": "continue" または "new_response", "response": "話す内容"}`;

      const messages = [
        { role: "system", content: system },
        ...((history || [])
          .slice(-6)
          .map((h) => ({ role: h.role, content: h.content })) || []),
        { role: "user", content: String(userText ?? "") },
      ];

      const data = await callMistral(messages, {
        temperature: 0.3,
        responseFormat: { type: "json_object" },
      });

      const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
      const action = parsed.action === "continue" ? "continue" : "new_response";
      const response = String(parsed.response ?? "");
      json(res, 200, { action, response });
      return;
    }

    if (path === "/vps/ai/generate-step-guidance") {
      const { stepText, stepIndex, totalSteps, recipeName, recipeContext } =
        body;
      const tipForStep = recipeContext?.stepTips?.[stepIndex] ?? "";
      const ingredientsInfo = recipeContext
        ? `\n材料: ${(recipeContext.ingredients || []).join("、")}`
        : "";

      const system = `あなたは調理ナビゲーターです。料理の工程を、手が塞がっている人に音声で伝えるための案内文を生成してください。
2-3文で、ポイントやコツを含めて簡潔に案内してください。「です・ます」調で。
マークダウン記法（#、*、-など）は使わず、プレーンテキストのみで出力してください。`;

      const data = await callAnthropic({
        system,
        maxTokens: 256,
        messages: [
          {
            role: "user",
            content: `料理: ${recipeName}${ingredientsInfo}
工程 ${stepIndex + 1}/${totalSteps}: ${stepText}
${tipForStep ? `この工程の注意点・コツ: ${tipForStep}` : ""}

この工程の音声案内文を生成してください。`,
          },
        ],
      });

      const guidance = data.content?.[0]?.text ?? "";
      json(res, 200, { guidance });
      return;
    }

    if (path === "/vps/tts/synthesize") {
      const { text } = body;
      const audioBase64 = await callElevenLabs({ text: String(text ?? "") });
      json(res, 200, { audioBase64 });
      return;
    }

    if (path === "/vps/scheduler/analyze-recipe") {
      const { prompt } = body;
      const data = await callAnthropic({
        maxTokens: 2048,
        messages: [{ role: "user", content: String(prompt ?? "") }],
      });

      const text = data.content?.[0]?.text ?? "";
      const start = text.indexOf("[");
      const end = text.lastIndexOf("]");
      if (start === -1 || end === -1) {
        throw new Error("No JSON array in response");
      }
      const parsed = JSON.parse(text.slice(start, end + 1));
      json(res, 200, { steps: parsed });
      return;
    }

    if (path === "/vps/scheduler/agent/tools") {
      json(res, 200, {
        tools: SCHEDULER_AGENT_TOOLS,
        supported_algorithms: AGENTIC_ALGORITHMS,
      });
      return;
    }

    if (path === "/vps/scheduler/agent/evaluate") {
      const {
        schedule_id,
        schedule,
        kitchen,
        criteria,
        criteria_text,
        criteria_rules,
        task_limit_for_llm,
      } = body;

      const result = await runScheduleEvaluationOneCall({
        schedule_id,
        schedule,
        kitchen,
        criteria:
          criteria ??
          (criteria_text || Array.isArray(criteria_rules)
            ? {
                criteria_text,
                criteria_rules,
              }
            : undefined),
        task_limit_for_llm,
      });
      json(res, 200, {
        mode: "one_call_evaluator",
        result,
      });
      return;
    }

    if (path === "/vps/scheduler/agent/run") {
      const {
        user_request,
        recipes,
        kitchen,
        schedule_id,
        objective,
        algorithm_candidates,
        options,
        max_steps,
      } = body;

      if (!String(user_request ?? "").trim()) {
        json(res, 400, { error: "user_request is required" });
        return;
      }

      const result = await runSchedulerAgent({
        userRequest: user_request,
        recipes,
        kitchen,
        scheduleId: schedule_id,
        objective,
        algorithmCandidates: algorithm_candidates,
        options,
        maxSteps: max_steps,
      });
      json(res, 200, {
        mode: "tool_calling_agent",
        result,
      });
      return;
    }

    if (path === "/vps/scheduler/create-schedule") {
      const { recipes, kitchen, options } = body;
      const result = await runCreateSchedule({ recipes, kitchen, options });
      json(res, 200, result);
      return;
    }

    json(res, 404, { error: "not found" });
  } catch (e) {
    json(res, 500, { error: e instanceof Error ? e.message : String(e) });
  }
});

const port = Number(process.env.PORT || 8080);
server.listen(port, "0.0.0.0", () => {
  console.log(`vps-api listening on :${port}`);
});
