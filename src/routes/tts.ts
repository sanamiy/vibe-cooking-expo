import { callElevenLabs } from "../lib/elevenlabs";
import { jsonResponse } from "../lib/json";

export async function handleTts(request: Request, env: Env): Promise<Response> {
  const { text } = (await request.json()) as { text: string };
  const audioBase64 = await callElevenLabs(env, { text });
  return jsonResponse(200, { audioBase64 });
}
