// Buttons (DESIGN_SYSTEM.md §5): one height on a phone (48 points for the primary and secondary, a 44-point target
// for the quiet text button), three looks. Primary is ink, never green: green is spare time.
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";
import { TARGET, font, useColours } from "./theme";

export type ButtonVariant = "primary" | "secondary" | "quiet";

export function Button({
  label,
  onPress,
  variant = "secondary",
  disabled = false,
  destructive = false,
  block = false,
  accessibilityLabel,
  icon,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  /** Delete and Disconnect only; Drop is undoable and stays ink (DESIGN_SYSTEM.md §2). */
  destructive?: boolean;
  block?: boolean;
  accessibilityLabel?: string;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useColours();
  const ink = destructive ? c.deadline : c.ink;
  const look: ViewStyle =
    variant === "primary" ? { backgroundColor: ink, minHeight: 48, paddingHorizontal: 22 } : variant === "secondary" ? { borderWidth: 1, borderColor: destructive ? c.deadline : c.lineControl, minHeight: 48, paddingHorizontal: 18 } : { minHeight: TARGET, paddingHorizontal: 12 };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.base, look, block && styles.block, { opacity: disabled ? 0.5 : pressed ? 0.8 : 1 }, style]}
    >
      {icon}
      <Text style={[styles.text, { color: variant === "primary" ? c.paper : variant === "quiet" && !destructive ? c.ink2 : ink }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  block: { alignSelf: "stretch" },
  text: { fontFamily: font.semibold, fontSize: 17 },
});
