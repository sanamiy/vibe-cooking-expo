import {
  getElevenLabsModelId,
  getElevenLabsVoiceId,
  requireElevenLabsApiKey,
  requireMistralApiKey,
} from "@/services/apiConfig";
import { postJsonVps, shouldUseVpsProxy } from "@/services/vpsClient";
import { callAnthropicMessages } from "@/services/anthropicClient";

async function callMistralChat(
  messages: any[],
  opts?: { temperature?: number; responseFormat?: any },
) {
  const apiKey = requireMistralApiKey();
  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "mistral-small-latest",
      messages,
      temperature: opts?.temperature ?? 0.7,
      ...(opts?.responseFormat ? { response_format: opts.responseFormat } : {}),
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Mistral API error ${res.status}: ${text}`);
  return JSON.parse(text);
}

async function callElevenLabsTts(text: string): Promise<string> {
  const apiKey = requireElevenLabsApiKey();
  const voiceId = getElevenLabsVoiceId();
  const modelId = getElevenLabsModelId();
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
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
  return btoa(binary);
}

// ---------- Types ----------

export type Intent =
  | "next_step"
  | "previous_step"
  | "question"
  | "timer_status"
  | "end_session";

interface ConversationEntry {
  role: "user" | "assistant";
  content: string;
}

// ---------- Mistral: Intent classification ----------

export async function classifyIntent(
  userText: string,
  currentStep: string,
  prevStep: string | null,
  nextStep: string | null,
  recipeName?: string,
): Promise<Intent> {
  if (shouldUseVpsProxy()) {
    try {
      const data = await postJsonVps<{ intent: Intent }>(
        "/vps/ai/classify-intent",
        {
          userText,
          currentStep,
          prevStep,
          nextStep,
          recipeName,
        },
      );
      const valid: Intent[] = [
        "next_step",
        "previous_step",
        "question",
        "timer_status",
        "end_session",
      ];
      return valid.includes(data.intent) ? data.intent : "question";
    } catch (e) {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.warn("[ai] VPS classify-intent failed, fallback to direct:", e);
      }
    }
  }

  const system = `あなたは調理アシスタントの意図分類器です。
ユーザーの発話を以下のラベルのいずれかに分類してください。
ラベル: next_step, previous_step, question, timer_status, end_session

${recipeName ? `料理名: ${recipeName}` : ""}
現在の工程: ${currentStep}
${prevStep ? `前の工程: ${prevStep}` : "（最初の工程です）"}
${nextStep ? `次の工程: ${nextStep}` : "（最後の工程です）"}

JSON形式で返してください: {"intent": "ラベル"}`;

  const data = await callMistralChat(
    [
      { role: "system", content: system },
      { role: "user", content: String(userText ?? "") },
    ],
    { temperature: 0, responseFormat: { type: "json_object" } },
  );
  const text = data.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(text);
  const valid: Intent[] = [
    "next_step",
    "previous_step",
    "question",
    "timer_status",
    "end_session",
  ];
  return valid.includes(parsed.intent) ? parsed.intent : "question";
}

// ---------- Mistral: Question answering ----------

export interface RecipeContext {
  recipeName: string;
  ingredients: string[];
  allSteps: string[];
  stepTips?: string[];
}

export async function answerQuestion(
  userText: string,
  currentStep: string,
  stepProgress: string,
  history: ConversationEntry[],
  recipeContext?: RecipeContext,
): Promise<string> {
  if (shouldUseVpsProxy()) {
    try {
      const data = await postJsonVps<{ answer: string }>(
        "/vps/ai/answer-question",
        {
          userText,
          currentStep,
          stepProgress,
          history,
          recipeContext,
        },
      );
      return data.answer;
    } catch (e) {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.warn(
          "[ai] VPS answer-question failed, fallback to direct:",
          e,
        );
      }
    }
  }

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
  const data = await callMistralChat(messages, { temperature: 0.7 });
  return data.choices?.[0]?.message?.content ?? "";
}

// ---------- Mistral: Barge-in (interruption) handling ----------

export interface BargeInResult {
  action: "continue" | "new_response";
  response: string;
}

export async function handleBargeIn(
  userText: string,
  interruptedSpeech: string,
  currentStep: string,
  stepProgress: string,
  history: ConversationEntry[],
  recipeContext?: RecipeContext,
): Promise<BargeInResult> {
  if (shouldUseVpsProxy()) {
    try {
      const data = await postJsonVps<BargeInResult>("/vps/ai/barge-in", {
        userText,
        interruptedSpeech,
        currentStep,
        stepProgress,
        history,
        recipeContext,
      });
      return {
        action: data.action === "continue" ? "continue" : "new_response",
        response: data.response,
      };
    } catch (e) {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.warn("[ai] VPS barge-in failed, fallback to direct:", e);
      }
    }
  }

  const recipeInfo = recipeContext
    ? `\n料理名: ${recipeContext.recipeName}\n材料: ${(recipeContext.ingredients || []).join("、")}`
    : "";

  const system = `あなたは調理アシスタントです。ユーザーがあなたの発話中に割り込みました。
${recipeInfo}
あなたが話していた内容: 「${interruptedSpeech}」
現在の工程: ${currentStep}
進捗: ${stepProgress}

ユーザーの割り込み発話を見て判断してください：
- ユーザーが「うん」「はい」「わかった」等の相槌や、特に意味のない発話の場合 → 中断された説明の続きを自然に話してください
- ユーザーが質問や指示をしている場合 → その質問/指示に応えてください

JSON形式で返してください：
{"action": "continue" または "new_response", "response": "話す内容"}`;

  const data = await callMistralChat(
    [
      { role: "system", content: system },
      ...((history || []).slice(-6).map((h) => ({
        role: h.role,
        content: h.content,
      })) || []),
      { role: "user", content: String(userText ?? "") },
    ],
    { temperature: 0.3, responseFormat: { type: "json_object" } },
  );

  const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
  return {
    action: parsed.action === "continue" ? "continue" : "new_response",
    response: String(parsed.response ?? ""),
  };
}

// ---------- Claude: Step guidance generation ----------

export async function generateStepGuidance(
  stepText: string,
  stepIndex: number,
  totalSteps: number,
  recipeName: string,
  recipeContext?: RecipeContext,
): Promise<string> {
  if (shouldUseVpsProxy()) {
    try {
      const data = await postJsonVps<{ guidance: string }>(
        "/vps/ai/generate-step-guidance",
        {
          stepText,
          stepIndex,
          totalSteps,
          recipeName,
          recipeContext,
        },
      );
      return data.guidance;
    } catch (e) {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.warn(
          "[ai] VPS generate-step-guidance failed, fallback to direct:",
          e,
        );
      }
    }
  }

  const tipForStep = recipeContext?.stepTips?.[stepIndex] ?? "";
  const ingredientsInfo = recipeContext
    ? `\n材料: ${(recipeContext.ingredients || []).join("、")}`
    : "";

  const system = `あなたは調理ナビゲーターです。料理の工程を、手が塞がっている人に音声で伝えるための案内文を生成してください。
2-3文で、ポイントやコツを含めて簡潔に案内してください。「です・ます」調で。
マークダウン記法（#、*、-など）は使わず、プレーンテキストのみで出力してください。`;

  const data = await callAnthropicMessages({
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

  return data.content?.[0]?.text ?? "";
}

// ---------- ElevenLabs: TTS ----------

export async function synthesizeSpeech(text: string): Promise<string> {
  if (shouldUseVpsProxy()) {
    try {
      const data = await postJsonVps<{ audioBase64: string }>(
        "/vps/tts/synthesize",
        {
          text,
        },
      );
      return data.audioBase64;
    } catch (e) {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.warn("[ai] VPS tts failed, fallback to direct:", e);
      }
    }
  }

  return await callElevenLabsTts(text);
}
