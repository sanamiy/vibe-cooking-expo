import { theme } from "@/constants/theme";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

interface BackButtonProps {
  label: string;
  onPress?: () => void;
}

export function BackButton({ label, onPress }: BackButtonProps) {
  const handlePress = () => {
    if (onPress) {
      onPress();
    } else {
      router.back();
    }
  };

  return (
    <Pressable onPress={handlePress} style={styles.container}>
      <View style={styles.wrapper}>
        {/* 背面に配置される回転した正方形 */}
        <View style={styles.rotatedSquare} />
        {/* 前面に配置される角丸の長方形 */}
        <View style={styles.rectangle}>
          <Text style={styles.text}>{label}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 20,
    top: 14,
    zIndex: 1,
  },
  wrapper: {
    flexDirection: "row",
    alignItems: "center",
    opacity: 0.85,
    height: 32,
  },
  rotatedSquare: {
    position: "absolute",
    left: 4,
    top: 3.5, // (32 - 25) / 2 = 3.5
    width: 25,
    height: 25,
    backgroundColor: theme.colors.border, // グレー
    transform: [{ rotate: "45deg" }],
    borderRadius: 4, // 角を丸くする
  },
  rectangle: {
    backgroundColor: theme.colors.border, // グレー
    height: 32,
    paddingLeft: 12,
    paddingRight: 16,
    marginLeft: 16, // 回転した正方形の右半分を完全に覆い隠す
    justifyContent: "center",
    borderTopRightRadius: 6, // 右上を丸く (小さく)
    borderBottomRightRadius: 6, // 右下を丸く (小さく)
  },
  text: {
    color: theme.colors.subText,
    fontSize: 13,
    fontWeight: "700",
  },
});
