import { getApiMode, requireVpsBaseUrl } from "@/services/apiConfig";

export function shouldUseVpsProxy(): boolean {
  const mode = getApiMode();
  return mode === "vps_proxy";
}

const DEFAULT_VPS_TIMEOUT_MS = 20_000;

export async function postJsonVps<T>(
  path: string,
  body: any,
  opts?: { timeoutMs?: number },
): Promise<T> {
  const base = requireVpsBaseUrl();
  const controller = new AbortController();
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_VPS_TIMEOUT_MS;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal as any,
    });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error(`VPS API timeout after ${timeoutMs}ms: ${path}`);
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`VPS API error ${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}
