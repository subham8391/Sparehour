// The list card (DESIGN_SYSTEM.md §5): a rounded surface with a hairline edge; its rows are divided by hairlines.
import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useColours } from "./theme";

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useColours();
  return <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }, style]}>{children}</View>;
}

/** One row of a card; every row after the first has a hairline above it. */
export function CardRow({ first, children, style }: { first?: boolean; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useColours();
  return <View style={[!first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, borderWidth: 1, borderRadius: 18, overflow: "hidden" },
});
