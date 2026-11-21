// The browser preview of the Inbox (npm run preview, /inbox): the real views, made-up data. `?state=empty` is Inbox
// zero, `?state=walk` is Triage all on a task, `?state=done` is its last line; `?scheme=dark` and `?part=evening`
// as on Today's preview. Nothing is written: every choice is taken and dropped. See _layout.web.tsx.
import { useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { Temporal } from "@/core/time";
import type { Task } from "@/core/types";
import type { DayPart } from "@/features/looks/look";
import type { InboxRow } from "~/screens/inbox/inbox-rows";
import { InboxView } from "~/screens/inbox/inbox-view";
import { TriageWalkView } from "~/screens/inbox/triage-walk-view";
import { Icon } from "~/ui/icon";
import { colours, type Scheme } from "~/ui/theme";

const row = (id: string, title: string, detail: string, estimateMin: number | null = null): InboxRow => ({ task: { id, title, estimateMin, carryCount: 0, projectId: null, deadline: null, doDate: null, doTime: null } as unknown as Task, detail });
const ROWS: InboxRow[] = [
  row("i1", "Look into the pricing thing", "added today"),
  row("i2", "Renew the domain before it lapses", "added 2d", 15),
  row("i3", "That thing Dana mentioned about the offsite", "Acme · added 5d"),
  row("i4", "Book the dentist", "added 12d", 30),
];
const CHOICES = {
  projects: [
    { id: "p1", name: "Website", area: "Work", areaId: "a1" },
    { id: "p2", name: "Offsite", area: "Work", areaId: "a1" },
    { id: "p3", name: "Flat move", area: "Home", areaId: "a2" },
  ],
  areaOrder: [
    { id: "a1", name: "Work" },
    { id: "a2", name: "Home" },
  ],
};
const nothing = () => undefined;

export default function Preview() {
  const q = useLocalSearchParams<{ scheme?: string; part?: string; state?: string }>();
  const scheme: Scheme = q.scheme === "dark" ? "dark" : "light";
  const part = (["morning", "afternoon", "evening", "night"].includes(q.part ?? "") ? q.part : "afternoon") as DayPart;
  const c = colours[scheme];
  if (q.state === "walk" || q.state === "done") {
    return (
      <TriageWalkView
        loaded
        task={q.state === "walk" ? { title: "Look into the pricing thing", age: "added 2d", note: "Ask Dana what she meant.\nThe old plan ends in March." } : null}
        position={2}
        total={4}
        left={q.state === "done" ? 1 : 3}
        choices={["today", "tomorrow", "week", "someday", "drop"]}
        fields={["project", "estimate", "deadline"]}
        last="Renew the domain before it lapses"
        canBack
        remaining={(n) => `That’s every one. ${n === 1 ? "One stays" : `${n} stay`} in the Inbox for later.`}
        onAct={nothing}
        onStep={nothing}
        onUndo={nothing}
        onLeave={nothing}
      />
    );
  }
  return (
    <View style={{ flex: 1 }}>
      <InboxView
        part={part}
        rows={q.state === "empty" ? [] : ROWS}
        today={Temporal.Now.plainDateISO()}
        now={Temporal.Now.instant()}
        zone={Temporal.Now.timeZoneId()}
        defaultEstimateMin={35}
        choices={CHOICES}
        onComplete={nothing}
        onTriage={nothing}
        onSnooze={nothing}
        onMoveToDay={nothing}
        onProject={nothing}
        onEstimate={nothing}
        onDeadline={nothing}
        onTriageAll={nothing}
        bottomRoom={88}
      />
      <View style={{ position: "absolute", right: 20, bottom: 20, width: 58, height: 58, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: c.ink }}>
        <Icon name="plus" size={26} color={c.paper} strokeWidth={2} />
      </View>
    </View>
  );
}
