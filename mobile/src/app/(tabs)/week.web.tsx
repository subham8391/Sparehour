// The browser preview of the Week tab (npm run preview, /week): the real view, a made-up week (week-fixture.ts).
// `?scheme=dark`, `?part=evening`, `?mode=calendar`, `?offset=1` and `?state=empty|waiting` pick what is shown.
// See _layout.web.tsx.
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import type { DayPart } from "@/features/looks/look";
import { clampOffset, type WeekMode } from "@/features/upcoming/week";
import { TODAY, weekFixture } from "~/screens/week/week-fixture";
import { PreviewRows } from "~/screens/rows/preview-rows";
import { WeekView } from "~/screens/week/week-view";
import { Fab } from "~/ui/fab";
import { colours, type Scheme } from "~/ui/theme";

export default function Preview() {
  const q = useLocalSearchParams<{ scheme?: string; part?: string; state?: string; mode?: string; offset?: string }>();
  const scheme: Scheme = q.scheme === "dark" ? "dark" : "light";
  const part = (["morning", "afternoon", "evening", "night"].includes(q.part ?? "") ? q.part : "afternoon") as DayPart;
  const [mode, setMode] = useState<WeekMode>(q.mode === "calendar" ? "calendar" : "rolling");
  const [offset, setOffset] = useState(() => clampOffset(Number(q.offset ?? 0)));
  const week = weekFixture({ mode, offset, empty: q.state === "empty" });
  const c = colours[scheme];
  return (
    <PreviewRows>
      <WeekView
        part={part}
        eyebrow={mode === "calendar" ? "Upcoming · calendar week" : "Upcoming · rolling 7 days"}
        title={week.title}
        totalLine={week.totalLine}
        mode={mode}
        offset={offset}
        today={TODAY}
        days={week.days}
        later={week.later}
        laterReadouts={week.laterReadouts}
        unplanned={week.unplanned}
        nextDays={week.nextDays}
        projectNames={week.projectNames}
        defaultEstimateMin={35}
        waiting={q.state === "waiting"}
        noneAhead={week.noneAhead}
        onMode={(m) => {
          setMode(m);
          setOffset(0);
        }}
        onStep={(delta) => setOffset((o) => clampOffset(o + delta))}
        onThisWeek={() => setOffset(0)}
        onComplete={() => undefined}
        onOpenDay={() => undefined}
        onAdd={() => undefined}
        onPlace={() => undefined}
        onMove={() => undefined}
        onBreakDown={() => undefined}
        bottomRoom={88}
      />
      <Fab label="Add a task" onPress={() => undefined} />
    </PreviewRows>
  );
}
