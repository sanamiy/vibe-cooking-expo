import { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => {
  const appConfig = require("./config.json") as { apiMode?: string };
  const apiMode = appConfig?.apiMode;
  const isDirect = apiMode === "direct_client";

  return {
    ...config,
    name: "Vibe Cooking",
    slug: "vibe-cooking-expo",
    extra: {
      VPS_API_BASE_URL: process.env.EXPO_PUBLIC_VPS_API_BASE_URL,
      CLOUDFLARE_PROXY_BASE_URL: process.env.EXPO_PUBLIC_CLOUDFLARE_PROXY_BASE_URL,
      ...(isDirect
        ? {
            MISTRAL_API_KEY: process.env.EXPO_PUBLIC_MISTRAL_API_KEY,
            CLAUDE_API_KEY: process.env.EXPO_PUBLIC_CLAUDE_API_KEY,
            ELEVENLABS_API_KEY: process.env.EXPO_PUBLIC_ELEVENLABS_API_KEY,
            ELEVENLABS_VOICE_ID: process.env.EXPO_PUBLIC_ELEVENLABS_VOICE_ID,
            ELEVENLABS_MODEL: process.env.EXPO_PUBLIC_ELEVENLABS_MODEL,
          }
        : {}),
    },
  };
};
