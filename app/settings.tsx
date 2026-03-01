import { AppButton } from "@/components/AppButton";
import { BackButton } from "@/components/BackButton";
import { LanguageToggle } from "@/components/LanguageToggle";
import { theme } from "@/constants/theme";
import { useAppSettings, type SchedulerAlgorithm } from "@/contexts/AppSettingsContext";
import { router } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

// Feature flag: アルゴリズム選択UIを表示するか
const SHOW_ALGORITHM_SELECTOR = __DEV__;

const ALGORITHM_OPTIONS: {
  value: SchedulerAlgorithm;
  labelKey: string;
  descKey: string;
}[] = [
  { value: "auto", labelKey: "settings.algo_auto", descKey: "settings.algo_auto_desc" },
  {
    value: "claude_e2e",
    labelKey: "settings.algo_claude_e2e",
    descKey: "settings.algo_claude_e2e_desc",
  },
  { value: "greedy", labelKey: "settings.algo_greedy", descKey: "settings.algo_greedy_desc" },
  { value: "genetic", labelKey: "settings.algo_genetic", descKey: "settings.algo_genetic_desc" },
  {
    value: "critical_path",
    labelKey: "settings.algo_critical_path",
    descKey: "settings.algo_critical_path_desc",
  },
  { value: "backward", labelKey: "settings.algo_backward", descKey: "settings.algo_backward_desc" },
  { value: "astar", labelKey: "settings.algo_astar", descKey: "settings.algo_astar_desc" },
];
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

export default function SettingsScreen() {
  const { t } = useTranslation();
  const { settings, updateSettings } = useAppSettings();
  const insets = useSafeAreaInsets();
  const [servingsPerMeal, setServingsPerMeal] = useState(settings.servingsPerMeal);
  const [stoveBurners, setStoveBurners] = useState(settings.stoveBurners);
  const [schedulerAlgorithm, setSchedulerAlgorithm] = useState(settings.schedulerAlgorithm);

  const incrementBurners = () => setStoveBurners((prev) => Math.min(5, prev + 1));
  const decrementBurners = () => setStoveBurners((prev) => Math.max(1, prev - 1));
  const incrementServings = () => setServingsPerMeal((prev) => Math.min(10, prev + 1));
  const decrementServings = () => setServingsPerMeal((prev) => Math.max(1, prev - 1));

  const onSave = () => {
    updateSettings({
      servingsPerMeal,
      stoveBurners,
      schedulerAlgorithm,
    });
    router.back();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <BackButton label={t("common.home")} onPress={() => router.back()} />
        <Text style={styles.title}>{t("settings.title")}</Text>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 40 + insets.bottom }]}>
        <Text style={styles.description}>{t("settings.description")}</Text>

        <View style={styles.settingCard}>
          <View style={styles.cardHeader}>
            <Text style={styles.icon}>🌐</Text>
            <Text style={styles.cardTitle}>{t("settings.language")}</Text>
          </View>
          <LanguageToggle />
        </View>

        <View style={styles.settingCard}>
          <View style={styles.cardHeader}>
            <Text style={styles.icon}>🔥</Text>
            <Text style={styles.cardTitle}>{t("settings.stoveBurners")}</Text>
          </View>
          <View style={styles.counterControl}>
            <Pressable
              style={({ pressed }) => [
                styles.counterBtn,
                stoveBurners <= 1 && styles.counterBtnDisabled,
                pressed && !styles.counterBtnDisabled && { opacity: 0.8 },
              ]}
              onPress={decrementBurners}
              disabled={stoveBurners <= 1}
            >
              <Text
                style={[styles.counterBtnText, stoveBurners <= 1 && styles.counterBtnTextDisabled]}
              >
                −
              </Text>
            </Pressable>
            <View style={styles.counterValueWrap}>
              <Text style={styles.counterValue}>{stoveBurners}</Text>
              <Text style={styles.unit}>{t("settings.stoveBurnersUnit")}</Text>
            </View>
            <Pressable
              style={({ pressed }) => [
                styles.counterBtn,
                stoveBurners >= 5 && styles.counterBtnDisabled,
                pressed && !styles.counterBtnDisabled && { opacity: 0.8 },
              ]}
              onPress={incrementBurners}
              disabled={stoveBurners >= 5}
            >
              <Text
                style={[styles.counterBtnText, stoveBurners >= 5 && styles.counterBtnTextDisabled]}
              >
                ＋
              </Text>
            </Pressable>
          </View>
          <Text style={styles.cardCaption}>{t("settings.stoveBurnersCaption")}</Text>
        </View>

        <View style={styles.settingCard}>
          <View style={styles.cardHeader}>
            <Text style={styles.icon}>🍽️</Text>
            <Text style={styles.cardTitle}>{t("settings.servingsPerMeal")}</Text>
          </View>
          <View style={styles.counterControl}>
            <Pressable
              style={({ pressed }) => [
                styles.counterBtn,
                servingsPerMeal <= 1 && styles.counterBtnDisabled,
                pressed && !styles.counterBtnDisabled && { opacity: 0.8 },
              ]}
              onPress={decrementServings}
              disabled={servingsPerMeal <= 1}
            >
              <Text
                style={[
                  styles.counterBtnText,
                  servingsPerMeal <= 1 && styles.counterBtnTextDisabled,
                ]}
              >
                −
              </Text>
            </Pressable>
            <View style={styles.counterValueWrap}>
              <Text style={styles.counterValue}>{servingsPerMeal}</Text>
              <Text style={styles.unit}>{t("settings.servingsUnit")}</Text>
            </View>
            <Pressable
              style={({ pressed }) => [
                styles.counterBtn,
                servingsPerMeal >= 10 && styles.counterBtnDisabled,
                pressed && !styles.counterBtnDisabled && { opacity: 0.8 },
              ]}
              onPress={incrementServings}
              disabled={servingsPerMeal >= 10}
            >
              <Text
                style={[
                  styles.counterBtnText,
                  servingsPerMeal >= 10 && styles.counterBtnTextDisabled,
                ]}
              >
                ＋
              </Text>
            </Pressable>
          </View>
          <Text style={styles.cardCaption}>{t("settings.servingsCaption")}</Text>
        </View>

        {/* アルゴリズム選択 (開発モードのみ) */}
        {SHOW_ALGORITHM_SELECTOR && (
          <View style={styles.settingCard}>
            <View style={styles.cardHeader}>
              <Text style={styles.icon}>🧪</Text>
              <Text style={styles.cardTitle}>{t("settings.scheduling")}</Text>
            </View>
            <View style={styles.algorithmGrid}>
              {ALGORITHM_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.value}
                  style={[
                    styles.algorithmOption,
                    schedulerAlgorithm === opt.value && styles.algorithmOptionSelected,
                  ]}
                  onPress={() => setSchedulerAlgorithm(opt.value)}
                >
                  <Text
                    style={[
                      styles.algorithmLabel,
                      schedulerAlgorithm === opt.value && styles.algorithmLabelSelected,
                    ]}
                  >
                    {t(opt.labelKey)}
                  </Text>
                  <Text style={styles.algorithmDesc}>{t(opt.descKey)}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.cardCaption}>{t("settings.schedulingCaption")}</Text>
          </View>
        )}

        <View style={styles.actions}>
          <View style={styles.saveBtnWrap}>
            <AppButton label={t("settings.save")} onPress={onSave} />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.bg },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.card,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  backBtn: {
    position: "absolute",
    left: 20,
    top: 20,
    zIndex: 1,
  },
  back: {
    color: theme.colors.subText,
    fontWeight: "700",
    fontSize: 14,
  },
  title: {
    color: theme.colors.primary,
    fontWeight: "800",
    fontSize: 20,
    fontFamily: "M PLUS Rounded 1c",
  },
  content: {
    paddingTop: 32,
    paddingHorizontal: 20,
    maxWidth: 480,
    width: "100%",
    alignSelf: "center",
  },
  description: {
    color: theme.colors.subText,
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 32,
    fontSize: 15,
  },
  settingCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    padding: 24,
    marginBottom: 20,
    // iOS Shadow
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    // Android Shadow
    elevation: 4,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 24,
  },
  icon: { fontSize: 24 },
  cardTitle: {
    color: theme.colors.text,
    fontWeight: "800",
    fontSize: 18,
    fontFamily: "M PLUS Rounded 1c",
  },
  counterControl: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 32,
    marginBottom: 16,
  },
  counterBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: theme.colors.primary,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  counterBtnDisabled: {
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.bg,
  },
  counterBtnText: {
    color: theme.colors.primary,
    fontSize: 24,
    fontWeight: "600",
    lineHeight: 26,
    marginTop: -2,
  },
  counterBtnTextDisabled: { color: theme.colors.subText },
  counterValueWrap: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
    minWidth: 80,
    justifyContent: "center",
  },
  counterValue: {
    color: theme.colors.text,
    fontWeight: "800",
    fontSize: 36,
    fontFamily: "Quicksand",
  },
  unit: {
    color: theme.colors.subText,
    fontWeight: "700",
    fontSize: 16,
  },
  cardCaption: {
    color: theme.colors.subText,
    textAlign: "center",
    fontSize: 13,
  },
  actions: {
    marginTop: 20,
    alignItems: "center",
  },
  saveBtnWrap: {
    width: "100%",
  },
  // Algorithm selector
  algorithmGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
    justifyContent: "center",
  },
  algorithmOption: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.radius.md,
    borderWidth: 2,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.bg,
    minWidth: 100,
    alignItems: "center",
  },
  algorithmOptionSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary + "15",
  },
  algorithmLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.text,
  },
  algorithmLabelSelected: {
    color: theme.colors.primary,
  },
  algorithmDesc: {
    fontSize: 11,
    color: theme.colors.subText,
    marginTop: 2,
  },
});
