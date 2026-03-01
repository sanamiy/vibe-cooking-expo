const http = require("node:http");
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

async function callAnthropic({ system, messages, maxTokens }) {
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
      ...(system ? { system } : {}),
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

    if (path === "/vps/scheduler/create-schedule") {
      const { recipes, kitchen, options } = body;
      const startedAt = Date.now();

      if (options?.algorithm === "claude_e2e") {
        try {
          const prompt = buildClaudeE2EPrompt(recipes, kitchen);
          const data = await callAnthropic({
            maxTokens: 4096,
            messages: [{ role: "user", content: prompt }],
          });
          const text = data.content?.[0]?.text ?? "";
          const result = parseClaudeE2ESchedule(
            text,
            recipes,
            Date.now() - startedAt,
          );
          json(res, 200, result);
          return;
        } catch (e) {
          console.warn(
            `Claude E2E scheduling failed, fallback to deterministic scheduler: ${
              e instanceof Error ? e.message : String(e)
            }`,
          );
          if (!scheduler) {
            json(res, 500, {
              error:
                "Scheduler module not loaded for fallback. Run 'npm run build' in vps-api.",
            });
            return;
          }
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
          json(res, 200, fallback);
          return;
        }
      }

      if (!scheduler) {
        json(res, 500, {
          error: "Scheduler module not loaded. Run 'npm run build' in vps-api.",
        });
        return;
      }

      // Optionally analyze recipes with LLM first
      let analyzedRecipes = [];
      if (options?.use_llm_analysis !== false) {
        for (const recipe of recipes) {
          try {
            const stepsText = recipe.steps
              .map((s, i) => `${i + 1}. ${s.text.replace(/<[^>]*>/g, "")}`)
              .join("\n");
            const ingredientsText = recipe.ingredients.join(", ");

            const prompt = `レシピの各工程を解析し、必要に応じて細かいサブステップに分割してください。

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
            console.warn(`LLM analysis failed for ${recipe.name}:`, e.message);
          }
        }
      }

      const result = await scheduler.createSchedule(
        { recipes, kitchen, options },
        analyzedRecipes.length > 0 ? analyzedRecipes : undefined,
      );

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
