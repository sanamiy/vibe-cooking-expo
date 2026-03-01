import {
  getApiMode,
  getVpsBaseUrlOptional,
  requireVpsBaseUrl,
} from "@/services/apiConfig";
import { Platform } from "react-native";

const IS_WEB = Platform.OS === "web";

export function shouldUseVpsProxy(): boolean {
  const mode = getApiMode();
  if (mode === "vps_proxy") return true;
  if (mode !== "direct_client") return false;
  if (!IS_WEB) return false;
  return !!getVpsBaseUrlOptional();
}

export async function postJsonVps<T>(path: string, body: any): Promise<T> {
  const base = requireVpsBaseUrl();
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
