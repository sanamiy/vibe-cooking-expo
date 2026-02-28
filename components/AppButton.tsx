import { theme } from "@/constants/theme";
import {
  Pressable,
  StyleSheet,
  Text,
  ViewStyle,
  TextStyle,
} from "react-native";

type ButtonVariant = "primary" | "secondary" | "accent" | "outline" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

interface Props {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
  style?: ViewStyle;
}

export const AppButton = ({
  label,
  onPress,
  disabled,
  variant = "primary",
  size = "md",
  style,
}: Props) => {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        styles[`${size}Size`],
        styles[`${variant}Variant`],
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Text
        style={[
          styles.textBase,
          styles[`${size}Text`],
          styles[`${variant}Text`],
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: {
    borderRadius: theme.radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.9,
  },
  disabled: {
    opacity: 0.5,
  },
  // Sizes
  smSize: {
    minHeight: 28,
    paddingHorizontal: 12,
  },
  mdSize: {
    minHeight: 36,
    paddingHorizontal: 16,
  },
  lgSize: {
    minHeight: 44,
    paddingHorizontal: 20,
  },
  // Variants
  primaryVariant: {
    backgroundColor: theme.colors.primary,
  },
  secondaryVariant: {
    backgroundColor: theme.colors.secondary,
  },
  accentVariant: {
    backgroundColor: theme.colors.accent,
  },
  outlineVariant: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  ghostVariant: {
    backgroundColor: "transparent",
  },
  // Text
  textBase: {
    fontWeight: "700",
  },
  smText: {
    fontSize: 12,
  },
  mdText: {
    fontSize: 14,
  },
  lgText: {
    fontSize: 16,
  },
  primaryText: {
    color: "#fff",
  },
  secondaryText: {
    color: "#fff",
  },
  accentText: {
    color: theme.colors.text,
  },
  outlineText: {
    color: theme.colors.primary,
  },
  ghostText: {
    color: theme.colors.text,
  },
});
