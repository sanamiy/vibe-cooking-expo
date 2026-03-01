import { callMistral } from "../lib/mistral";
import { jsonResponse } from "../lib/json";

interface RecipeContext {
  recipeName?: string;
  ingredients?: string[];
  allSteps?: string[];
  stepTips?: string[];
}

export async function handleAnswerQuestion(request: Request, env: Env): Promise<Response> {
  const { userText, currentStep, stepProgress, history, recipeContext } =
    (await request.json()) as {
      userText: string;
      currentStep: string;
      stepProgress: string;
      history: Array<{ role: string; content: string }>;
      recipeContext?: RecipeContext;
    };

  let recipeInfo = "";
  if (recipeContext) {
    if (recipeContext.recipeName) {
      recipeInfo += `料理名: ${recipeContext.recipeName}\n`;
    }
    if (recipeContext.ingredients && recipeContext.ingredients.length > 0) {
      recipeInfo += `\n【材料】\n${recipeContext.ingredients.map((i) => `- ${i}`).join("\n")}\n`;
    }
    if (recipeContext.allSteps && recipeContext.allSteps.length > 0) {
      recipeInfo += `\n【全工程】\n${recipeContext.allSteps.map((s, idx) => `${idx + 1}. ${s}`).join("\n")}\n`;
    }
    if (recipeContext.stepTips && recipeContext.stepTips.length > 0) {
      recipeInfo += `\n【各工程の注意点・コツ】\n${recipeContext.stepTips.map((t, idx) => `${idx + 1}. ${t}`).join("\n")}\n`;
    }
  }

  const systemPrompt = `あなたは料理中のユーザーを助ける調理アシスタントです。
手が塞がっているので、簡潔に（1-2文で）答えてください。
${recipeInfo}
現在の工程: ${currentStep}
進捗: ${stepProgress}`;

  const recentHistory = history.slice(-10);
  const messages = [...recentHistory, { role: "user", content: userText }];

  const result = (await callMistral(env, [{ role: "system", content: systemPrompt }, ...messages], {
    temperature: 0.7,
  })) as {
    choices: Array<{ message: { content: string } }>;
  };

  const answer = result.choices[0].message.content;

  return jsonResponse(200, { answer });
}
