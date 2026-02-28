import Constants from "expo-constants";

const VPS_API_BASE_URL =
  (Constants.expoConfig?.extra as any)?.VPS_API_BASE_URL ??
  process.env.EXPO_PUBLIC_VPS_API_BASE_URL ??
  "";

function requireVpsBaseUrl() {
  if (!VPS_API_BASE_URL) {
    throw new Error("Missing VPS API base URL");
  }
  return VPS_API_BASE_URL.replace(/\/$/, "");
}

async function postJson<T>(path: string, body: any): Promise<T> {
  const base = requireVpsBaseUrl();
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`VPS API error ${res.status}: ${text}`);
  }
  return (await res.json()) as T;
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
  const data = await postJson<{ intent: Intent }>("/vps/ai/classify-intent", {
    userText,
    currentStep,
    prevStep,
    nextStep,
    recipeName,
  });
  const valid: Intent[] = [
    "next_step",
    "previous_step",
    "question",
    "timer_status",
    "end_session",
  ];
  return valid.includes(data.intent) ? data.intent : "question";
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
  const data = await postJson<{ answer: string }>("/vps/ai/answer-question", {
    userText,
    currentStep,
    stepProgress,
    history,
    recipeContext,
  });
  return data.answer;
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
  const data = await postJson<BargeInResult>("/vps/ai/barge-in", {
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
}

// ---------- Claude: Step guidance generation ----------

export async function generateStepGuidance(
  stepText: string,
  stepIndex: number,
  totalSteps: number,
  recipeName: string,
  recipeContext?: RecipeContext,
): Promise<string> {
  const data = await postJson<{ guidance: string }>(
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
}

// ---------- ElevenLabs: TTS ----------

export async function synthesizeSpeech(text: string): Promise<string> {
  const data = await postJson<{ audioBase64: string }>("/vps/tts/synthesize", {
    text,
  });
  return data.audioBase64;
}
