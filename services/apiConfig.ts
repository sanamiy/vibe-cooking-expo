import Constants from "expo-constants";

type ApiMode = "vps_proxy" | "direct_client" | "cloudflare";

const config = require("@/config.json") as {
  apiMode?: ApiMode;
};

function requireApiMode(): ApiMode {
  const mode = config?.apiMode;
  if (mode !== "vps_proxy" && mode !== "direct_client" && mode !== "cloudflare") {
    throw new Error(
      "Missing or invalid config.json apiMode (expected vps_proxy, direct_client, or cloudflare)",
    );
  }
  return mode;
}

export function getApiMode(): ApiMode {
  return requireApiMode();
}

export function requireVpsBaseUrl(): string {
  const base = getVpsBaseUrlOptional();
  if (base === null) throw new Error("Missing VPS API base URL");
  return base;
}

export function getVpsBaseUrlOptional(): string | null {
  const raw =
    (Constants.expoConfig?.extra as any)?.VPS_API_BASE_URL ??
    process.env.EXPO_PUBLIC_VPS_API_BASE_URL;
  if (raw === "") return "";
  if (!raw) return null;
  return raw.replace(/\/$/, "");
}

export function getCloudflareBaseUrlOptional(): string | null {
  const raw =
    (Constants.expoConfig?.extra as any)?.CLOUDFLARE_PROXY_BASE_URL ??
    process.env.EXPO_PUBLIC_CLOUDFLARE_PROXY_BASE_URL;
  if (raw === "") return "";
  if (!raw) return null;
  return raw.replace(/\/$/, "");
}

export function requireProxyBaseUrl(): string {
  const mode = requireApiMode();
  if (mode === "cloudflare") {
    const url = getCloudflareBaseUrlOptional();
    if (url === null) throw new Error("Missing Cloudflare proxy base URL");
    return url;
  }
  return requireVpsBaseUrl();
}

export function requireMistralApiKey(): string {
  const mode = requireApiMode();
  if (mode === "vps_proxy" || mode === "cloudflare") {
    throw new Error(`Mistral API key should not be used on client in ${mode} mode`);
  }

  const key =
    (Constants.expoConfig?.extra as any)?.MISTRAL_API_KEY ??
    process.env.EXPO_PUBLIC_MISTRAL_API_KEY ??
    process.env.MISTRAL_API_KEY ??
    "";

  if (!key) throw new Error("Missing Mistral API key");
  return key;
}

export function requireClaudeApiKey(): string {
  const mode = requireApiMode();
  if (mode === "vps_proxy" || mode === "cloudflare") {
    throw new Error(`Claude API key should not be used on client in ${mode} mode`);
  }

  const key =
    (Constants.expoConfig?.extra as any)?.CLAUDE_API_KEY ??
    process.env.EXPO_PUBLIC_CLAUDE_API_KEY ??
    process.env.CLAUDE_API_KEY ??
    "";
  if (!key) throw new Error("Missing Claude API key");
  return key;
}

export function requireElevenLabsApiKey(): string {
  const mode = requireApiMode();
  if (mode === "vps_proxy" || mode === "cloudflare") {
    throw new Error(`ElevenLabs API key should not be used on client in ${mode} mode`);
  }

  const key =
    (Constants.expoConfig?.extra as any)?.ELEVENLABS_API_KEY ??
    process.env.EXPO_PUBLIC_ELEVENLABS_API_KEY ??
    process.env.ELEVENLABS_API_KEY ??
    "";
  if (!key) throw new Error("Missing ElevenLabs API key");
  return key;
}

export function getElevenLabsVoiceId(): string {
  return (
    (Constants.expoConfig?.extra as any)?.ELEVENLABS_VOICE_ID ??
    process.env.EXPO_PUBLIC_ELEVENLABS_VOICE_ID ??
    process.env.ELEVENLABS_VOICE_ID ??
    "aFDSnmXyFHr0IRaw35mG"
  );
}

export function getElevenLabsModelId(): string {
  return (
    (Constants.expoConfig?.extra as any)?.ELEVENLABS_MODEL ??
    process.env.EXPO_PUBLIC_ELEVENLABS_MODEL ??
    process.env.ELEVENLABS_MODEL ??
    "eleven_multilingual_v2"
  );
}
