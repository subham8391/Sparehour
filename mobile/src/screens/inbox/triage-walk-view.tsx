// Triage all as the phone draws it (SCREENS.md §5): the queue one task at a time, full-screen. The task with its age
// and its note, a button for where it goes (Today · Tomorrow · This week · Someday · Drop) and for what it needs
// (Project… · Estimate… · Deadline…), Back and Skip, and Leave. It ends on "Inbox zero. Nice.", or on how many stay
// when some were skipped. "Last: … Undo" takes the walk's latest write back and returns to that task, as the web's
// does. Presentational: the walk itself is the web app's own (features/inbox/use-triage-walk.ts), run by triage-walk.tsx.
import type { ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Text } from "~/ui/text";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TRIAGE_LABEL, type TriageAction, type TriageChoice, type TriageField } from "@/features/inbox/triage";
import { Button } from "~/ui/button";
import { TARGET, font, useColours } from "~/ui/theme";

export interface TriageWalkViewProps {
  /** The walk's name, in small capitals at the top. */
  label?: string;
  /** False until the queue has been read: the frame alone. */
  loaded: boolean;
  /** The task on screen; null once the walk has passed the last one. */
  task: { title: string; age: string | null; note: string } | null;
  /** "2 of 5". */
  position: number;
  total: number;
  /** How many still wait, for the last line. */
  left: number;
  /** Where it can go, and what it can be given: the actions offered, in order (the Inbox offers them all). */
  choices: readonly TriageChoice[];
  fields: readonly TriageField[];
  /** The title of the walk's latest write, when it can be taken back. */
  last: string | null;
  canBack: boolean;
  /** The last line, once nothing is left waiting. */
  done?: string;
  /** The last line when some were skipped and still wait. */
  remaining: (n: number) => string;
  onAct: (action: TriageAction) => void;
  onStep: (dir: 1 | -1) => void;
  onUndo: () => void;
  onLeave: () => void;
  /** The pickers, drawn over the walk. */
  children?: ReactNode;
}

export function TriageWalkView(p: TriageWalkViewProps) {
  const c = useColours();
  const insets = useSafeAreaInsets();
  const label = p.label ?? "Triage";
  return (
    <View accessibilityViewIsModal style={[styles.fill, { backgroundColor: c.paper, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }]}>
      <View style={styles.head}>
        <Text accessibilityRole="header" style={[styles.eyebrow, { color: c.ink2 }]}>
          {label.toUpperCase()}
          {p.task ? <Text style={[styles.count, { color: c.ink2 }]}>{`  ${p.position} of ${p.total}`}</Text> : null}
        </Text>
        <Button variant="quiet" label="Leave" onPress={p.onLeave} style={styles.leave} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {!p.loaded ? null : p.task ? (
          <>
            <View accessibilityLiveRegion="polite" style={styles.task}>
              <Text accessibilityRole="header" style={[styles.title, { color: c.ink }]}>
                {p.task.title}
              </Text>
              {p.task.age ? <Text style={[styles.age, { color: c.ink2 }]}>{p.task.age}</Text> : null}
              {p.task.note ? (
                <Text numberOfLines={6} style={[styles.note, { color: c.ink2 }]}>
                  {p.task.note}
                </Text>
              ) : null}
            </View>
            <View accessibilityLabel="Where it goes" style={styles.grid}>
              {p.choices.map((a) => (
                <Button key={a} label={TRIAGE_LABEL[a]} onPress={() => p.onAct(a)} style={[styles.cell, a === "today" && { borderColor: c.ink }]} />
              ))}
            </View>
            <View accessibilityLabel="What it needs" style={styles.grid}>
              {p.fields.map((a) => (
                <Button key={a} variant="quiet" label={`${TRIAGE_LABEL[a]}…`} onPress={() => p.onAct(a)} style={styles.cell} />
              ))}
            </View>
            <View accessibilityLabel="The queue" style={styles.nav}>
              <Button variant="quiet" label="Back" disabled={!p.canBack} onPress={() => p.onStep(-1)} style={styles.navStart} />
              <Button variant="quiet" label="Skip" onPress={() => p.onStep(1)} style={styles.navEnd} />
            </View>
          </>
        ) : (
          <View style={styles.end}>
            <Text accessibilityRole="header" style={[styles.endLine, { color: c.ink }]}>
              {p.left === 0 ? (p.done ?? "Inbox zero. Nice.") : p.remaining(p.left)}
            </Text>
            <Button variant="primary" label="Done" onPress={p.onLeave} />
          </View>
        )}
      </ScrollView>

      {p.last !== null ? (
        <View style={styles.last}>
          <Text numberOfLines={1} style={[styles.lastText, { color: c.ink2 }]}>{`Last: “${p.last}”`}</Text>
          <Button variant="quiet" label="Undo" accessibilityLabel="Undo the last one" onPress={p.onUndo} />
        </View>
      ) : null}
      {p.children}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  head: { minHeight: TARGET, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20 },
  eyebrow: { fontFamily: font.semibold, fontSize: 13, letterSpacing: 1.3 },
  count: { fontFamily: font.regular, letterSpacing: 0, fontVariant: ["tabular-nums"] },
  leave: { marginRight: -12 },
  body: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16, gap: 24 },
  task: { gap: 8 },
  title: { fontFamily: font.display, fontSize: 26, lineHeight: 32 },
  age: { fontFamily: font.regular, fontSize: 14, lineHeight: 20 },
  note: { fontFamily: font.regular, fontSize: 17, lineHeight: 24 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  cell: { flexGrow: 1, flexBasis: "45%" },
  nav: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  navStart: { marginLeft: -12 },
  navEnd: { marginRight: -12 },
  end: { alignItems: "flex-start", gap: 16, paddingVertical: 24 },
  endLine: { fontFamily: font.displayMedium, fontSize: 22, lineHeight: 28 },
  last: { minHeight: TARGET, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 20 },
  lastText: { flexShrink: 1, fontFamily: font.regular, fontSize: 14 },
});
