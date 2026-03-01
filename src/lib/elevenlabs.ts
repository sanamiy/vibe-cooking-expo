export async function callElevenLabs(env: Env, opts: { text: string }): Promise<string> {
  const voiceId = env.ELEVENLABS_VOICE_ID ?? "aFDSnmXyFHr0IRaw35mG";
  const modelId = env.ELEVENLABS_MODEL ?? "eleven_multilingual_v2";

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": env.ELEVENLABS_API_KEY,
    },
    body: JSON.stringify({
      text: opts.text,
      model_id: modelId,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`ElevenLabs API error ${response.status}: ${text}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
