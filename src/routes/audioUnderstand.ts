import { callMistralAudioChat, extractAssistantText } from "../lib/mistral";
import { jsonResponse } from "../lib/json";

export async function handleAudioUnderstand(
  request: Request,
  env: Env,
): Promise<Response> {
  const { audioBase64, prompt, model, temperature } =
    (await request.json()) as {
      audioBase64?: string;
      prompt?: string;
      model?: string;
      temperature?: number;
    };

  if (!audioBase64 || typeof audioBase64 !== "string") {
    return jsonResponse(400, { error: "audioBase64 is required" });
  }

  const result = await callMistralAudioChat(env, {
    audioBase64,
    prompt,
    model,
    temperature,
  });

  const text = extractAssistantText(result);
  return jsonResponse(200, { text });
}
