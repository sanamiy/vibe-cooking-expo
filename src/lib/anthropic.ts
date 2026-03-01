export async function callAnthropic(
  env: Env,
  opts: {
    system?: string;
    messages: Array<{ role: string; content: string }>;
    maxTokens: number;
  },
): Promise<unknown> {
  const body: Record<string, unknown> = {
    model: "claude-haiku-4-5-20251001",
    max_tokens: opts.maxTokens,
    messages: opts.messages,
  };

  if (opts.system) {
    body.system = opts.system;
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.CLAUDE_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${text}`);
  }

  return response.json();
}
