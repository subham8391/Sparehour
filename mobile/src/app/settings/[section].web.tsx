// The browser preview of a Settings section (npm run preview, /settings/<section>): the real views, made-up data.
// Changes are kept on the page, so a control can be tried; nothing is saved anywhere. `?state=` picks what is shown:
// account `unsynced`; calendar `none`; connections `loading` | `offline` | `none` | `error`; data `empty` | `busy`;
// notifications `on` | `allowed` | `blocked` | `error` (this device's reminders; off by default); planning `usual`.
// See _layout.web.tsx.
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import type { SettingsPatch } from "@/data/repositories/settings-repo";
import { sectionTitle } from "@/features/settings/sections";
import type { Segment } from "@/features/settings/settings-rules";
import { asValues, type SettingsValues } from "@/features/settings/settings-values";
import { reminderCopy } from "~/push/copy";
import { AboutView } from "~/screens/settings/about-view";
import { AccountView } from "~/screens/settings/account-view";
import { AppearanceView } from "~/screens/settings/appearance-view";
import { CalendarView } from "~/screens/settings/calendar-view";
import { ConnectionsView } from "~/screens/settings/connections-view";
import { DataView } from "~/screens/settings/data-view";
import { HoursView } from "~/screens/settings/hours-view";
import { NotificationsView } from "~/screens/settings/notifications-view";
import { SectionFrame } from "~/screens/settings/parts";
import { PlanningView } from "~/screens/settings/planning-view";
import { phoneSection } from "~/screens/settings/sections";
import { ACCOUNTS, APPS, BATCHES, CALENDARS, CLOCK, ENDPOINT, TODAY, VALUES, WORK_WEEK } from "~/screens/settings/settings-fixture";
import { SettingsView } from "~/screens/settings/settings-view";
import { setLookChoice, useLookChoice } from "~/ui/looks/look-choice";
import { setMotionChoice, useMotionChoice } from "~/ui/motion";
import { setThemeChoice, useThemeChoice } from "~/ui/theme-choice";

const nothing = () => undefined;

export default function Preview() {
  const q = useLocalSearchParams<{ section?: string; state?: string }>();
  const key = phoneSection(q.section);
  const state = q.state ?? "";
  const theme = useThemeChoice();
  const look = useLookChoice();
  const motion = useMotionChoice();
  const [values, setValues] = useState<SettingsValues>(VALUES);
  const [week, setWeek] = useState<Segment[][]>(WORK_WEEK);
  const [calendars, setCalendars] = useState(CALENDARS);
  const change = (patch: SettingsPatch) => setValues((v) => ({ ...v, ...asValues(patch) }));
  if (!key) return <SettingsView items={null} onOpen={nothing} />;
  const body = () => {
    switch (key) {
      case "account":
        return (
          <AccountView
            account={{ name: "Sam Carter", email: "sam@example.com" }}
            methods={["Google", "Email code"]}
            timezone={values.timezone}
            detectedTimeZone="Asia/Kolkata"
            onTimeZone={(timezone) => change({ timezone })}
            onSignOut={nothing}
            unsynced={state === "unsynced" ? 3 : null}
            onSignOutAnyway={nothing}
            onStaySignedIn={nothing}
            exporter={{ onExport: nothing, busy: false, error: null, lastFile: null }}
            onDeleteAccount={async () => "Couldn’t delete your account just now. Nothing changed — try again."}
          />
        );
      case "working-hours":
        return <HoursView values={values} workHours={week} onChange={change} onWorkHours={(weekday, segments) => setWeek((w) => w.map((day, i) => (i === weekday ? segments : day)))} />;
      case "calendar":
        return (
          <CalendarView
            accounts={state === "none" ? [] : ACCOUNTS}
            calendars={state === "none" ? [] : calendars}
            configured={state === "unset" ? false : true}
            outlook={state !== "unset"}
            notice={null}
            busy={false}
            now={CLOCK}
            onConnect={nothing}
            onAllowWrite={nothing}
            onFullAccess={nothing}
            onSyncNow={nothing}
            onDisconnect={nothing}
            onRead={(id, read) => setCalendars((list) => list.map((c) => (c.id === id ? { ...c, read } : c)))}
            onPrivate={(id, isPrivate) => setCalendars((list) => list.map((c) => (c.id === id ? { ...c, private: isPrivate } : c)))}
            onWriteTarget={(id) => setCalendars((list) => list.map((c) => ({ ...c, writeTarget: c.id === id })))}
          />
        );
      case "connections":
        return (
          <ConnectionsView
            state={state === "loading" ? { kind: "loading" } : state === "offline" ? { kind: "offline" } : { kind: "ready", apps: state === "none" ? [] : APPS, endpoint: ENDPOINT, available: true }}
            busy={null}
            error={state === "error" ? "Couldn’t disconnect Claude. Check your connection and try again." : null}
            onRetry={nothing}
            onShare={nothing}
            onAccess={nothing}
            onDisconnect={nothing}
          />
        );
      case "notifications":
        return (
          <NotificationsView
            values={values}
            workHours={week}
            onChange={change}
            device={{
              copy: reminderCopy(state === "blocked" ? "denied" : state === "on" || state === "allowed" ? "granted" : "default", state === "on", true),
              busy: false,
              error: state === "error" ? "Couldn’t reach Sparehour. Check your connection and try again." : null,
              onEnable: nothing,
              onDisable: nothing,
              onOpenSettings: nothing,
            }}
          />
        );
      case "planning":
        return <PlanningView values={values} usual={state === "usual" ? 45 : null} onChange={change} />;
      case "appearance":
        // The preview is drawn in whatever is chosen here, as the app is: every look, in light and dark.
        return <AppearanceView look={look} theme={theme} motion={motion} onLook={setLookChoice} onTheme={setThemeChoice} onMotion={setMotionChoice} />;
      case "data":
        return (
          <DataView
            exporter={{ busy: state === "busy" ? "json" : null, error: null, lastFile: state === "busy" ? null : "sparehour-export-2026-11-22.json", onExport: nothing }}
            batches={state === "empty" ? [] : BATCHES}
            today={TODAY}
            archivedIds={state === "empty" ? [] : ["t1", "t2", "t3", "t4"]}
            droppedIds={state === "empty" ? [] : ["d1", "d2"]}
            onClearSlate={nothing}
            onRestore={async (batch) => batch.tasks.length}
            onDeletePermanently={async (ids) => ids.length}
          />
        );
      case "about":
        return <AboutView version="android-1.0.0" onPrivacy={nothing} />;
    }
  };
  return <SectionFrame title={sectionTitle(key)}>{body()}</SectionFrame>;
}
