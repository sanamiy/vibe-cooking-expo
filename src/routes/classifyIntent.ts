import { callMistral } from "../lib/mistral";
import { jsonResponse } from "../lib/json";

const VALID_INTENTS = ["next_step", "previous_step", "question", "timer_status", "end_session"];

export async function handleClassifyIntent(request: Request, env: Env): Promise<Response> {
  const { userText, currentStep, prevStep, nextStep, recipeName } = (await request.json()) as {
    userText: string;
    currentStep: string;
    prevStep?: string;
    nextStep?: string;
    recipeName?: string;
  };

  const systemPrompt = `あなたは調理アシスタントの意図分類器です。
ユーザーの発話を以下のラベルのいずれかに分類してください。
ラベル: next_step, previous_step, question, timer_status, end_session

${recipeName ? `料理名: ${recipeName}` : ""}
現在の工程: ${currentStep}
${prevStep ? `前の工程: ${prevStep}` : "（最初の工程です）"}
${nextStep ? `次の工程: ${nextStep}` : "（最後の工程です）"}

JSON形式で返してください: {"intent": "ラベル"}`;

  const result = (await callMistral(
    env,
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userText },
    ],
    { temperature: 0, responseFormat: { type: "json_object" } },
  )) as { choices: Array<{ message: { content: string } }> };

  const parsed = JSON.parse(result.choices[0].message.content) as {
    intent: string;
  };

  const intent = VALID_INTENTS.includes(parsed.intent) ? parsed.intent : "question";

  return jsonResponse(200, { intent });
}
