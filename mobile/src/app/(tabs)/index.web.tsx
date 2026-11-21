// The browser preview of Today (npm run preview): the real view, made-up data. `?scheme=dark`, `?part=evening` and
// `?state=empty|none|over` pick what is shown. See _layout.web.tsx.
import { useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import type { Task } from "@/core/types";
import type { DayPart } from "@/features/looks/look";
import { todayRows } from "~/screens/today-rows";
import type { Summary } from "~/screens/today-summary";
import { TodayView } from "~/screens/today-view";
import { Icon } from "~/ui/icon";
import { colours, type Scheme } from "~/ui/theme";

const task = (id: string, title: string, estimateMin: number | null, carryCount = 0) => ({ id, title, estimateMin, carryCount }) as unknown as Task;
const SPARE: Summary = { kind: "spare", figure: "3h 25m", line: "2h 35m planned · 1h in meetings · done by 16:25", shares: { busy: 0.12, planned: 0.31, buffer: 0.15, spare: 0.42 } };
const OVER: Summary = { kind: "over", figure: "1h 10m", line: "8h 40m planned · 1h in meetings", shares: { busy: 0.12, planned: 0.88, buffer: 0, spare: 0 } };
const NONE: Summary = { kind: "none", line: "No working hours today" };

export default function Preview() {
  const q = useLocalSearchParams<{ scheme?: string; part?: string; state?: string }>();
  const scheme: Scheme = q.scheme === "dark" ? "dark" : "light";
  const part = (["morning", "afternoon", "evening", "night"].includes(q.part ?? "") ? q.part : "afternoon") as DayPart;
  const empty = q.state === "empty" || q.state === "none";
  const rows = empty
    ? []
    : todayRows([task("c1", "Run 5k", 30, 19), task("c2", "Take B12 Vit", null, 3)], [task("t1", "Write the quarterly report for the board", 90), task("t2", "Call the bank", null), task("t3", "Review the budget", 45)], [task("e1", "Read two chapters", 30)]);
  const c = colours[scheme];
  return (
    <View style={{ flex: 1 }}>
      <TodayView
        part={part}
        eyebrow={`Today · ${part === "evening" || part === "night" ? "Evening" : part === "morning" ? "Morning" : "Afternoon"}`}
        title="Saturday 21 November"
        summary={q.state === "none" ? NONE : q.state === "over" ? OVER : SPARE}
        rows={rows}
        defaultEstimateMin={35}
        onComplete={() => undefined}
        onMenu={() => undefined}
        bottomRoom={88}
      />
      <View style={{ position: "absolute", right: 20, bottom: 20, width: 58, height: 58, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: c.ink }}>
        <Icon name="plus" size={26} color={c.paper} strokeWidth={2} />
      </View>
    </View>
  );
}
