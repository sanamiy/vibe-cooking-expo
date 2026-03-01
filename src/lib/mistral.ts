export async function callMistral(
  env: Env,
  messages: Array<{ role: string; content: string }>,
  opts?: { temperature?: number; responseFormat?: { type: string } },
): Promise<unknown> {
  const temperature = opts?.temperature ?? 0.7;

  const body: Record<string, unknown> = {
    model: "mistral-small-latest",
    messages,
    temperature,
  };

  if (opts?.responseFormat) {
    body.response_format = opts.responseFormat;
  }

  const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.MISTRAL_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Mistral API error ${response.status}: ${text}`);
  }

  return response.json();
}
