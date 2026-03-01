import { callAnthropic } from "../lib/anthropic";
import { jsonResponse } from "../lib/json";

export async function handleAnalyzeRecipe(request: Request, env: Env): Promise<Response> {
  const { prompt } = (await request.json()) as { prompt: string };

  const result = (await callAnthropic(env, {
    messages: [{ role: "user", content: prompt }],
    maxTokens: 2048,
  })) as { content: Array<{ text: string }> };

  const text = result.content[0].text;
  const firstBracket = text.indexOf("[");
  const lastBracket = text.lastIndexOf("]");

  if (firstBracket === -1 || lastBracket === -1) {
    throw new Error("Failed to extract JSON array from response");
  }

  const jsonStr = text.substring(firstBracket, lastBracket + 1);
  const steps = JSON.parse(jsonStr) as unknown[];

  return jsonResponse(200, { steps });
}
