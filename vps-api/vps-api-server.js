const http = require("node:http");
const { URL } = require("node:url");

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

    json(res, 404, { error: "not found" });
  } catch (e) {
    json(res, 500, { error: e instanceof Error ? e.message : String(e) });
  }
});

const port = Number(process.env.PORT || 8080);
server.listen(port, "0.0.0.0", () => {
  console.log(`vps-api listening on :${port}`);
});
