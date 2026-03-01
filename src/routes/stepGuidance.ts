import { callAnthropic } from "../lib/anthropic";
import { jsonResponse } from "../lib/json";

interface RecipeContext {
  ingredients?: string[];
  stepTips?: string[];
}

export async function handleStepGuidance(request: Request, env: Env): Promise<Response> {
  const { stepText, stepIndex, totalSteps, recipeName, recipeContext } = (await request.json()) as {
    stepText: string;
    stepIndex: number;
    totalSteps: number;
    recipeName: string;
    recipeContext?: RecipeContext;
  };

  const systemPrompt = `あなたは調理ナビゲーターです。料理の工程を、手が塞がっている人に音声で伝えるための案内文を生成してください。
2-3文で、ポイントやコツを含めて簡潔に案内してください。「です・ます」調で。
マークダウン記法（#、*、-など）は使わず、プレーンテキストのみで出力してください。`;

  let ingredientsInfo = "";
  if (recipeContext?.ingredients && recipeContext.ingredients.length > 0) {
    ingredientsInfo = `\n材料: ${recipeContext.ingredients.join("、")}`;
  }

  let tipForStep = "";
  if (recipeContext?.stepTips && recipeContext.stepTips[stepIndex]) {
    tipForStep = recipeContext.stepTips[stepIndex];
  }

  const userMessage = `料理: ${recipeName}${ingredientsInfo}
工程 ${stepIndex + 1}/${totalSteps}: ${stepText}
${tipForStep ? `この工程の注意点・コツ: ${tipForStep}` : ""}

この工程の音声案内文を生成してください。`;

  const result = (await callAnthropic(env, {
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
    maxTokens: 256,
  })) as { content: Array<{ text: string }> };

  const guidance = result.content[0].text;

  return jsonResponse(200, { guidance });
}
