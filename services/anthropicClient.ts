import { requireClaudeApiKey } from "@/services/apiConfig";

export async function callAnthropicMessages(params: {
  system?: string;
  messages: any[];
  maxTokens: number;
}) {
  const apiKey = requireClaudeApiKey();
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: params.maxTokens,
      ...(params.system ? { system: params.system } : {}),
      messages: params.messages,
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Anthropic API error ${res.status}: ${text}`);
  return JSON.parse(text);
}
