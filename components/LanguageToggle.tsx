import { theme } from "@/constants/theme";
import { useAppSettings } from "@/contexts/AppSettingsContext";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

export function LanguageToggle() {
  const { i18n } = useTranslation();
  const { updateSettings } = useAppSettings();
  const currentLang = i18n.language;

  const selectLang = (lang: "ja" | "en") => {
    i18n.changeLanguage(lang);
    updateSettings({ language: lang });
  };

  return (
    <View style={styles.container}>
      <Pressable
        style={[styles.button, currentLang === "ja" && styles.buttonActive]}
        onPress={() => selectLang("ja")}
      >
        <Text style={[styles.label, currentLang === "ja" && styles.labelActive]}>日本語</Text>
      </Pressable>
      <Pressable
        style={[styles.button, currentLang === "en" && styles.buttonActive]}
        onPress={() => selectLang("en")}
      >
        <Text style={[styles.label, currentLang === "en" && styles.labelActive]}>English</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
  },
  button: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: theme.radius.md,
    borderWidth: 2,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.bg,
    minWidth: 100,
    alignItems: "center",
  },
  buttonActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary + "15",
  },
  label: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.colors.text,
  },
  labelActive: {
    color: theme.colors.primary,
  },
});
