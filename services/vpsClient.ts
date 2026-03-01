import { getApiMode, requireProxyBaseUrl } from "@/services/apiConfig";

export function shouldUseServerProxy(): boolean {
  const mode = getApiMode();
  return mode === "vps_proxy" || mode === "cloudflare";
}

export function shouldUseVpsProxy(): boolean {
  return shouldUseServerProxy();
}

export async function postJsonVps<T>(path: string, body: any): Promise<T> {
  const base = requireProxyBaseUrl();
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`VPS API error ${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}
