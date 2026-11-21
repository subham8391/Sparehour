// The shutdown's 14-day rating line on the phone (SCREENS.md §15 step 3; the web's is
// features/rituals/rating-sparkline.tsx): a dot for each rated day, a line only between neighbouring ones, today
// last and a little larger. Ink tones only: a rating is not spare time and not a deadline. Where each mark goes is
// the web's own (rating-sparkline-shape.ts); the summary under it carries the meaning, the drawing is decoration.
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";
import { sparklineShape } from "@/features/rituals/rating-sparkline-shape";
import type { RatingTrend } from "@/features/rituals/rating-trend";
import { font, useColours } from "~/ui/theme";

export function RatingSparkline({ trend }: { trend: RatingTrend }) {
  const c = useColours();
  const { width, height, base, path, dots } = sparklineShape(trend);
  return (
    <View style={styles.figure}>
      <View aria-hidden style={[styles.drawing, { aspectRatio: width / height }]}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} fill="none">
          <Line x1={base.x1} x2={base.x2} y1={base.y} y2={base.y} stroke={c.line} strokeWidth={1} />
          {path ? <Path d={path} stroke={c.ink3} strokeWidth={1.5} strokeLinecap="round" /> : null}
          {dots.map((d) => (
            <Circle key={d.date} cx={d.cx} cy={d.cy} r={d.r} fill={d.today ? c.ink : c.ink2} />
          ))}
        </Svg>
      </View>
      <Text style={[styles.summary, { color: c.ink3 }]}>{trend.summary}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  figure: { paddingHorizontal: 20, gap: 6, marginTop: 8 },
  drawing: { width: "100%", maxWidth: 320 },
  summary: { fontFamily: font.regular, fontSize: 15, lineHeight: 21, fontVariant: ["tabular-nums"] },
});
