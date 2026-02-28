import { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Vibe Cooking",
  slug: "vibe-cooking-expo",
  extra: {
    VPS_API_BASE_URL: process.env.EXPO_PUBLIC_VPS_API_BASE_URL,
  },
});
