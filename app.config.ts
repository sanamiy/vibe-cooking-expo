import { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Vibe Cooking",
  slug: "vibe-cooking-expo",
  extra: {
    CLAUDE_API_KEY: process.env.CLAUDE_API_KEY,
    MISTRAL_API_KEY: process.env.MISTRAL_API_KEY,
    ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY,
  },
});
