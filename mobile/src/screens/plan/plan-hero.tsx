// The morning plan's frame step (SCREENS.md §14 step 1; the web's is features/rituals/plan-hero.tsx): the one spare
// number, the same figure Today shows by the same rule (hero-state.ts), over the working day drawn by the very
// ribbon Today's hero draws (today/ribbon.tsx), and one line of prose where stat tiles would be (frameLine). Nothing
// here is a decision, and nothing here is tapped.
import { StyleSheet } from "react-native";
import { Text } from "~/ui/text";
import type { Capacity } from "@/core/capacity";
import { formatMinutes } from "@/core/time";
import { frameLine } from "@/features/rituals/morning-plan";
import { heroState } from "@/features/today/hero-state";
import { spokenMinutes } from "@/features/today/ribbon-words";
import { Card } from "~/ui/card";
import { font, useColours, useWords } from "~/ui/theme";
import { RibbonTrack } from "../today/ribbon";
import type { RibbonShape } from "../today/ribbon-shape";

export function PlanHero({ capacity, ribbon, carried }: { capacity: Capacity | null; /** The day's drawing (ribbonShape); null on a day without working hours. */ ribbon: RibbonShape | null; /** How many tasks carried over, for the line. */ carried: number }) {
  const c = useColours();
  // "spare" / "over" as the look sets it: some write it in capitals, wider, or smaller (the web's .font-display-italic rule).
  const qualifierWords = useWords("qualifier", 22);
  if (!capacity || capacity.state === "no_work_day") return <Text style={[styles.line, styles.alone, { color: c.ink2 }]}>{frameLine(capacity, carried)}</Text>;
  const h = heroState(capacity);
  return (
    <Card style={styles.card}>
      <Text accessibilityLabel={`${formatMinutes(h.min)} ${h.over ? "over" : "spare"}`} accessibilityHint={`${spokenMinutes(h.min)} ${h.over ? "over" : "spare"}`} style={[styles.figure, { color: c.ink }]}>
        {formatMinutes(h.min)} <Text style={[styles.unit, qualifierWords, { color: h.over ? c.over : c.spare }]}>{h.over ? "over" : "spare"}</Text>
      </Text>
      {/* One state, like Today's: the day finishes, or it spills. */}
      {h.finish || h.spill ? <Text style={[styles.state, { color: h.spill ? c.over : c.spare }]}>{h.spill ?? h.finish}</Text> : null}
      {ribbon ? <RibbonTrack shape={ribbon} c={c} /> : null}
      <Text style={[styles.line, { color: c.ink2 }]}>{frameLine(capacity, carried)}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, paddingHorizontal: 18, paddingVertical: 16, gap: 8 },
  // As Today's hero (today/ribbon.tsx).
  figure: { fontFamily: font.display, fontSize: 38, lineHeight: 44, fontVariant: ["tabular-nums"] },
  unit: { fontFamily: font.qualifier, fontSize: 22, letterSpacing: 0 },
  state: { fontFamily: font.semibold, fontSize: 14, lineHeight: 20, fontVariant: ["tabular-nums"] },
  line: { fontFamily: font.regular, fontSize: 17, lineHeight: 24, marginTop: 4 },
  alone: { marginHorizontal: 20, marginTop: 0 },
});
