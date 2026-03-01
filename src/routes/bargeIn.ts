import { callMistral } from "../lib/mistral";
import { jsonResponse } from "../lib/json";

interface RecipeContext {
  recipeName?: string;
  ingredients?: string[];
}

export async function handleBargeIn(request: Request, env: Env): Promise<Response> {
  const { userText, interruptedSpeech, currentStep, stepProgress, history, recipeContext } =
    (await request.json()) as {
      userText: string;
      interruptedSpeech: string;
      currentStep: string;
      stepProgress: string;
      history: Array<{ role: string; content: string }>;
      recipeContext?: RecipeContext;
    };

  let recipeInfo = "";
  if (recipeContext) {
    if (recipeContext.recipeName) {
      recipeInfo += `\n料理名: ${recipeContext.recipeName}`;
    }
    if (recipeContext.ingredients && recipeContext.ingredients.length > 0) {
      recipeInfo += `\n材料: ${recipeContext.ingredients.join("、")}`;
    }
  }

  const systemPrompt = `あなたは調理アシスタントです。ユーザーがあなたの発話中に割り込みました。
${recipeInfo}
あなたが話していた内容: 「${interruptedSpeech}」
現在の工程: ${currentStep}
進捗: ${stepProgress}

ユーザーの割り込み発話を見て判断してください:
- ユーザーが「うん」「はい」「わかった」等の相槌や、特に意味のない発話の場合 → 中断された説明の続きを自然に話してください
- ユーザーが質問や指示をしている場合 → その質問/指示に応えてください

JSON形式で返してください:
{"action": "continue" または "new_response", "response": "話す内容"}`;

  const recentHistory = history.slice(-6);
  const messages = [...recentHistory, { role: "user", content: userText }];

  const result = (await callMistral(env, [{ role: "system", content: systemPrompt }, ...messages], {
    temperature: 0.3,
    responseFormat: { type: "json_object" },
  })) as { choices: Array<{ message: { content: string } }> };

  const parsed = JSON.parse(result.choices[0].message.content) as {
    action: string;
    response: string;
  };

  const action =
    parsed.action === "continue" || parsed.action === "new_response"
      ? parsed.action
      : "new_response";

  return jsonResponse(200, { action, response: parsed.response });
}
