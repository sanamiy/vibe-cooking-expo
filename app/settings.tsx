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
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
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
              style={({pressed}) => [styles.counterBtn, stoveBurners <= 1 && styles.counterBtnDisabled, pressed && !styles.counterBtnDisabled && {opacity: 0.8}]}
              onPress={decrementBurners}
              disabled={stoveBurners <= 1}>
              <Text style={[styles.counterBtnText, stoveBurners <= 1 && styles.counterBtnTextDisabled]}>−</Text>
            </Pressable>
            <View style={styles.counterValueWrap}>
              <Text style={styles.counterValue}>{stoveBurners}</Text>
              <Text style={styles.unit}>口</Text>
            </View>
            <Pressable
              style={({pressed}) => [styles.counterBtn, stoveBurners >= 5 && styles.counterBtnDisabled, pressed && !styles.counterBtnDisabled && {opacity: 0.8}]}
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
              style={({pressed}) => [styles.counterBtn, servingsPerMeal <= 1 && styles.counterBtnDisabled, pressed && !styles.counterBtnDisabled && {opacity: 0.8}]}
              onPress={decrementServings}
              disabled={servingsPerMeal <= 1}>
              <Text style={[styles.counterBtnText, servingsPerMeal <= 1 && styles.counterBtnTextDisabled]}>−</Text>
            </Pressable>
            <View style={styles.counterValueWrap}>
              <Text style={styles.counterValue}>{servingsPerMeal}</Text>
              <Text style={styles.unit}>人前</Text>
            </View>
            <Pressable
              style={({pressed}) => [styles.counterBtn, servingsPerMeal >= 10 && styles.counterBtnDisabled, pressed && !styles.counterBtnDisabled && {opacity: 0.8}]}
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
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1, 
    borderBottomColor: theme.colors.border, 
    backgroundColor: theme.colors.card,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtn: {
    position: 'absolute',
    left: 20,
    top: 20,
    zIndex: 1,
  },
  back: { 
    color: theme.colors.subText, 
    fontWeight: '700',
    fontSize: 14,
  },
  title: { 
    color: theme.colors.primary, 
    fontWeight: '800', 
    fontSize: 20,
    fontFamily: 'M PLUS Rounded 1c',
  },
  content: { paddingTop: 32, paddingHorizontal: 20, maxWidth: 480, width: '100%', alignSelf: 'center' },
  description: { 
    color: theme.colors.subText, 
    textAlign: 'center', 
    lineHeight: 24, 
    marginBottom: 32, 
    fontSize: 15 
  },
  settingCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    padding: 24,
    marginBottom: 20,
    // iOS Shadow
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    // Android Shadow
    elevation: 4,
  },
  cardHeader: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center',
    gap: 8, 
    marginBottom: 24,
  },
  icon: { fontSize: 24 },
  cardTitle: { 
    color: theme.colors.text, 
    fontWeight: '800', 
    fontSize: 18,
    fontFamily: 'M PLUS Rounded 1c',
  },
  counterControl: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    gap: 32, 
    marginBottom: 16,
  },
  counterBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: theme.colors.primary,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterBtnDisabled: {
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.bg,
  },
  counterBtnText: { 
    color: theme.colors.primary, 
    fontSize: 24, 
    fontWeight: '600', 
    lineHeight: 26,
    marginTop: -2,
  },
  counterBtnTextDisabled: { color: theme.colors.subText },
  counterValueWrap: { 
    flexDirection: 'row', 
    alignItems: 'baseline', 
    gap: 4, 
    minWidth: 80, 
    justifyContent: 'center',
  },
  counterValue: { 
    color: theme.colors.text, 
    fontWeight: '800', 
    fontSize: 36,
    fontFamily: 'Quicksand',
  },
  unit: { 
    color: theme.colors.subText, 
    fontWeight: '700', 
    fontSize: 16,
  },
  cardCaption: { 
    color: theme.colors.subText, 
    textAlign: 'center', 
    fontSize: 13,
  },
  actions: { 
    marginTop: 20, 
    alignItems: 'center',
  },
  saveBtnWrap: { 
    width: '100%', 
  },
});
