import { AppButton } from '@/components/AppButton';
import { theme } from '@/constants/theme';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function SettingsScreen() {
  const { settings, updateSettings } = useAppSettings();
  const insets = useSafeAreaInsets();
  const [servingsPerMeal, setServingsPerMeal] = useState(settings.servingsPerMeal);
  const [stoveBurners, setStoveBurners] = useState(settings.stoveBurners);

  const incrementBurners = () => setStoveBurners((prev) => Math.min(5, prev + 1));
  const decrementBurners = () => setStoveBurners((prev) => Math.max(1, prev - 1));
  const incrementServings = () => setServingsPerMeal((prev) => Math.min(10, prev + 1));
  const decrementServings = () => setServingsPerMeal((prev) => Math.max(1, prev - 1));

  const onSave = () => {
    updateSettings({
      servingsPerMeal,
      stoveBurners,
    });
    router.back();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.back}>← 戻る</Text>
        </Pressable>
        <Text style={styles.title}>キッチン設定</Text>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 40 + insets.bottom }]}>
        <Text style={styles.description}>キッチンの環境や、作る量に合わせて設定を調整してください。</Text>

        <View style={styles.settingCard}>
          <View style={styles.cardHeader}>
            <Text style={styles.icon}>🔥</Text>
            <Text style={styles.cardTitle}>コンロの数</Text>
          </View>
          <View style={styles.counterControl}>
            <Pressable
              style={[styles.counterBtn, stoveBurners <= 1 && styles.counterBtnDisabled]}
              onPress={decrementBurners}
              disabled={stoveBurners <= 1}>
              <Text style={[styles.counterBtnText, stoveBurners <= 1 && styles.counterBtnTextDisabled]}>−</Text>
            </Pressable>
            <View style={styles.counterValueWrap}>
              <Text style={styles.counterValue}>{stoveBurners}</Text>
              <Text style={styles.unit}>口</Text>
            </View>
            <Pressable
              style={[styles.counterBtn, stoveBurners >= 5 && styles.counterBtnDisabled]}
              onPress={incrementBurners}
              disabled={stoveBurners >= 5}>
              <Text style={[styles.counterBtnText, stoveBurners >= 5 && styles.counterBtnTextDisabled]}>＋</Text>
            </Pressable>
          </View>
          <Text style={styles.cardCaption}>同時に使えるコンロ・IHの数</Text>
        </View>

        <View style={styles.settingCard}>
          <View style={styles.cardHeader}>
            <Text style={styles.icon}>🍽️</Text>
            <Text style={styles.cardTitle}>1食あたりの人数</Text>
          </View>
          <View style={styles.counterControl}>
            <Pressable
              style={[styles.counterBtn, servingsPerMeal <= 1 && styles.counterBtnDisabled]}
              onPress={decrementServings}
              disabled={servingsPerMeal <= 1}>
              <Text style={[styles.counterBtnText, servingsPerMeal <= 1 && styles.counterBtnTextDisabled]}>−</Text>
            </Pressable>
            <View style={styles.counterValueWrap}>
              <Text style={styles.counterValue}>{servingsPerMeal}</Text>
              <Text style={styles.unit}>人前</Text>
            </View>
            <Pressable
              style={[styles.counterBtn, servingsPerMeal >= 10 && styles.counterBtnDisabled]}
              onPress={incrementServings}
              disabled={servingsPerMeal >= 10}>
              <Text style={[styles.counterBtnText, servingsPerMeal >= 10 && styles.counterBtnTextDisabled]}>＋</Text>
            </Pressable>
          </View>
          <Text style={styles.cardCaption}>レシピの分量を計算するために使用します</Text>
        </View>

        <View style={styles.actions}>
          <View style={styles.saveBtnWrap}>
            <AppButton label="保存する" onPress={onSave} />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.bg },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 2,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  back: { color: theme.colors.subText, fontWeight: '700', marginBottom: 6, fontSize: 13 },
  title: { color: theme.colors.text, fontWeight: '800', fontSize: 20 },
  content: { paddingTop: 28, paddingHorizontal: 16, maxWidth: 480, width: '100%', alignSelf: 'center' },
  description: { color: theme.colors.subText, textAlign: 'center', lineHeight: 22, marginBottom: 24, fontSize: 13 },
  settingCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 18 },
  icon: { fontSize: 20 },
  cardTitle: { color: theme.colors.text, fontWeight: '700', fontSize: 16 },
  counterControl: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 28, marginBottom: 10 },
  counterBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterBtnDisabled: {
    borderColor: '#D9CCC2',
    backgroundColor: '#FCFAF8',
  },
  counterBtnText: { color: theme.colors.primary, fontSize: 24, fontWeight: '300', lineHeight: 26 },
  counterBtnTextDisabled: { color: '#D9CCC2' },
  counterValueWrap: { flexDirection: 'row', alignItems: 'baseline', gap: 4, minWidth: 92, justifyContent: 'center' },
  counterValue: { color: theme.colors.text, fontWeight: '800', fontSize: 30 },
  unit: { color: theme.colors.text, fontWeight: '700', fontSize: 16 },
  cardCaption: { color: theme.colors.subText, textAlign: 'center', fontSize: 12 },
  actions: { marginTop: 12, alignItems: 'center' },
  saveBtnWrap: { width: '100%', maxWidth: 320 },
});
