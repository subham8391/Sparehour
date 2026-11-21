// Buttons (DESIGN_SYSTEM.md §5): one height on a phone (48 points for the primary and secondary, a 44-point target
// for the quiet text button), three looks. Primary is ink, never green: green is spare time.
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";
import { TARGET, corners, font, useColours, useShadows, useShape } from "./theme";

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
  const shape = useShape();
  const shadows = useShadows();
  const ink = destructive ? c.deadline : c.ink;
  // The look draws its own controls (DECISIONS.md, amendment 2026-10-20): the primary's fill, text, edge and shadow,
  // the secondary's edge, and every button's corners and edge width. A destructive primary stays the deadline colour.
  const look: ViewStyle =
    variant === "primary"
      ? { backgroundColor: destructive ? c.deadline : c.btn, borderWidth: shape.border.control, borderColor: destructive ? c.deadline : c.btnLine, boxShadow: destructive ? undefined : (shadows.btn ?? undefined), minHeight: 48, paddingHorizontal: 22 }
      : variant === "secondary"
        ? { borderWidth: shape.border.control, borderColor: destructive ? c.deadline : c.btn2Line, boxShadow: shadows.btn2 ?? undefined, minHeight: 48, paddingHorizontal: 18 }
        : { minHeight: TARGET, paddingHorizontal: 12 };
  const words = shape.controlCase === "uppercase" ? label.toUpperCase() : shape.controlCase === "lowercase" ? label.toLowerCase() : label;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.base, corners(shape.radius.control), look, block && styles.block, { opacity: disabled ? 0.5 : pressed ? 0.8 : 1 }, style]}
    >
      {icon}
      <Text style={[styles.text, { letterSpacing: shape.tracking.control * 17, color: variant === "primary" ? (destructive ? c.paper : c.btnInk) : variant === "quiet" && !destructive ? c.ink2 : variant === "secondary" && !destructive ? c.btn2Ink : ink }]}>{words}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  block: { alignSelf: "stretch" },
  text: { fontFamily: font.semibold, fontSize: 17 },
});
