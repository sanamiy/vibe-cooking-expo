import Constants from "expo-constants";

const CLAUDE_API_KEY =
  Constants.expoConfig?.extra?.CLAUDE_API_KEY ??
  process.env.EXPO_PUBLIC_CLAUDE_API_KEY ??
  process.env.CLAUDE_API_KEY ??
  "";
const MISTRAL_API_KEY =
  Constants.expoConfig?.extra?.MISTRAL_API_KEY ??
  process.env.EXPO_PUBLIC_MISTRAL_API_KEY ??
  process.env.MISTRAL_API_KEY ??
  "";
const ELEVENLABS_API_KEY =
  Constants.expoConfig?.extra?.ELEVENLABS_API_KEY ??
  process.env.EXPO_PUBLIC_ELEVENLABS_API_KEY ??
  process.env.ELEVENLABS_API_KEY ??
  "";

// ElevenLabs voice – Rachel (multilingual, works well with Japanese)
const ELEVENLABS_VOICE_ID = "aFDSnmXyFHr0IRaw35mG";
const ELEVENLABS_MODEL = "eleven_multilingual_v2";

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
  recipeName?: string
): Promise<Intent> {
  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${MISTRAL_API_KEY}`,
    },
    body: JSON.stringify({
      model: "mistral-small-latest",
      messages: [
        {
          role: "system",
          content: `あなたは調理アシスタントの意図分類器です。
ユーザーの発話を以下のラベルのいずれかに分類してください。
ラベル: next_step, previous_step, question, timer_status, end_session

${recipeName ? `料理名: ${recipeName}` : ""}
現在の工程: ${currentStep}
${prevStep ? `前の工程: ${prevStep}` : "（最初の工程です）"}
${nextStep ? `次の工程: ${nextStep}` : "（最後の工程です）"}

JSON形式で返してください: {"intent": "ラベル"}`,
        },
        { role: "user", content: userText },
      ],
      temperature: 0,
      response_format: { type: "json_object" },
    }),
  });

  const data: any = await res.json();
  const text = data.choices[0].message.content;
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
  recipeContext?: RecipeContext
): Promise<string> {
  const recipeInfo = recipeContext
    ? `
料理名: ${recipeContext.recipeName}

【材料】
${recipeContext.ingredients.map((ing) => `- ${ing}`).join("\n")}

【全工程】
${recipeContext.allSteps.map((s, i) => `${i + 1}. ${s}`).join("\n")}
${recipeContext.stepTips?.length ? `\n【各工程の注意点・コツ】\n${recipeContext.stepTips.map((t, i) => `${i + 1}. ${t}`).join("\n")}` : ""}`
    : "";

  const messages = [
    {
      role: "system" as const,
      content: `あなたは料理中のユーザーを助ける調理アシスタントです。
手が塞がっているので、簡潔に（1-2文で）答えてください。
${recipeInfo}

現在の工程: ${currentStep}
進捗: ${stepProgress}`,
    },
    ...history.slice(-10).map((h) => ({
      role: h.role as "user" | "assistant",
      content: h.content,
    })),
    { role: "user" as const, content: userText },
  ];

  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${MISTRAL_API_KEY}`,
    },
    body: JSON.stringify({
      model: "mistral-small-latest",
      messages,
      temperature: 0.7,
    }),
  });

  const data: any = await res.json();
  return data.choices[0].message.content;
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
  recipeContext?: RecipeContext
): Promise<BargeInResult> {
  const recipeInfo = recipeContext
    ? `\n料理名: ${recipeContext.recipeName}\n材料: ${recipeContext.ingredients.join("、")}`
    : "";

  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${MISTRAL_API_KEY}`,
    },
    body: JSON.stringify({
      model: "mistral-small-latest",
      messages: [
        {
          role: "system",
          content: `あなたは調理アシスタントです。ユーザーがあなたの発話中に割り込みました。
${recipeInfo}
あなたが話していた内容: 「${interruptedSpeech}」
現在の工程: ${currentStep}
進捗: ${stepProgress}

ユーザーの割り込み発話を見て判断してください:
- ユーザーが「うん」「はい」「わかった」等の相槌や、特に意味のない発話の場合 → 中断された説明の続きを自然に話してください
- ユーザーが質問や指示をしている場合 → その質問/指示に応えてください

JSON形式で返してください:
{"action": "continue" または "new_response", "response": "話す内容"}`,
        },
        ...history.slice(-6).map((h) => ({
          role: h.role as "user" | "assistant",
          content: h.content,
        })),
        { role: "user", content: userText },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
    }),
  });

  const data: any = await res.json();
  const parsed = JSON.parse(data.choices[0].message.content);
  return {
    action: parsed.action === "continue" ? "continue" : "new_response",
    response: parsed.response,
  };
}

// ---------- Claude: Step guidance generation ----------

export async function generateStepGuidance(
  stepText: string,
  stepIndex: number,
  totalSteps: number,
  recipeName: string,
  recipeContext?: RecipeContext
): Promise<string> {
  const tipForStep = recipeContext?.stepTips?.[stepIndex] ?? "";
  const ingredientsInfo = recipeContext
    ? `\n材料: ${recipeContext.ingredients.join("、")}`
    : "";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": CLAUDE_API_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      system: `あなたは調理ナビゲーターです。料理の工程を、手が塞がっている人に音声で伝えるための案内文を生成してください。
2-3文で、ポイントやコツを含めて簡潔に案内してください。「です・ます」調で。
マークダウン記法（#、*、-など）は使わず、プレーンテキストのみで出力してください。`,
      messages: [
        {
          role: "user",
          content: `料理: ${recipeName}${ingredientsInfo}
工程 ${stepIndex + 1}/${totalSteps}: ${stepText}
${tipForStep ? `この工程の注意点・コツ: ${tipForStep}` : ""}

この工程の音声案内文を生成してください。`,
        },
      ],
    }),
  });

  const data: any = await res.json();
  return data.content[0].text;
}

// ---------- ElevenLabs: TTS ----------

export async function synthesizeSpeech(text: string): Promise<string> {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": ELEVENLABS_API_KEY,
      },
      body: JSON.stringify({
        text,
        model_id: ELEVENLABS_MODEL,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    }
  );

  const arrayBuffer = await res.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
