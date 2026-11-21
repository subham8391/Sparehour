// An empty state (SCREENS.md §19): one calm line in a card, and what to do about it under it.
import type { ReactNode } from "react";
import { StyleSheet, Text } from "react-native";
import { Card } from "./card";
import { font, useColours } from "./theme";

export function Empty({ title, line, children }: { title: string; line?: string; children?: ReactNode }) {
  const c = useColours();
  return (
    <Card style={styles.card}>
      <Text style={[styles.title, { color: c.ink }]}>{title}</Text>
      {line ? <Text style={[styles.line, { color: c.ink3 }]}>{line}</Text> : null}
      {children}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { paddingHorizontal: 18, paddingVertical: 20, gap: 6 },
  title: { fontFamily: font.medium, fontSize: 20, lineHeight: 26 },
  line: { fontFamily: font.regular, fontSize: 15, lineHeight: 22 },
});
