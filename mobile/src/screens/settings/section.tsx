// One section of Settings on the phone (SCREENS.md §18 "Responsive": "each section pushes in … Back in the
// header"), at /settings/<section>, wired to the phone's own database. Every synced setting is read and written as
// the web's page does it (use-settings.ts); the sections that reach the server (Calendar's Sync now and Disconnect,
// Connected apps, the permanent deletes, the older half of the export, deleting the account) call the web app's own
// API with the session's token (~/api). Connecting a calendar leaves for the provider's consent in the system
// browser and comes back (~/calendar/connect). An unknown name is the list, as on the web. The drawing is the
// *-view.tsx beside this file.
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, Linking, Share } from "react-native";
import { Text } from "~/ui/text";
import { suggestDefault } from "@/core/estimates";
import { Temporal, todayFor } from "@/core/time";
import { useLocalDatabase, useQuery, type LocalDatabase } from "@/data/powersync";
import { ARCHIVED_SQL, DROPPED_SQL, type ArchivedRow } from "@/data/queries/archive";
import { CALENDARS_FULL_SQL, CALENDAR_CONNECTIONS_SQL, type CalendarConnectionRow, type CalendarFullRow } from "@/data/queries/calendar";
import { restoreBatch } from "@/data/repositories/archive";
import { CalendarRepo } from "@/data/repositories/calendar-repo";
import { DELETED_SIGNED_OUT, DELETE_ACCOUNT, deletedHeadline, deletionDay, requestAccountDeletion } from "@/features/account/deletion";
import { waitForUploads } from "@/features/account/leaving";
import { signInMethodLabels } from "@/features/account/sign-in-labels";
import { deletePermanently, groupBatches } from "@/features/archive/batches";
import { disconnectNotice, toAccountView, toCalendarView } from "@/features/calendar/calendar-views";
import { appConnectNotice } from "@/features/calendar/consent-outcome";
import type { CalendarProviderId } from "@/features/calendar/providers";
import { calendarSyncNow } from "@/features/calendar/sync-now";
import { useLearned } from "@/features/estimates/use-learned";
import { sectionTitle } from "@/features/settings/sections";
import { useConnections } from "@/features/settings/use-connections";
import { useUndoSink } from "@/features/undo/undo-context";
import { apiFetch } from "~/api";
import { supabase } from "~/auth/supabase";
import { useCalendarConnect, type ConnectPurpose } from "~/calendar/connect";
import { forgetReminders } from "~/push/device";
import { useReminders } from "~/push/use-reminders";
import { config } from "~/config";
import { BUILD, signOut } from "~/sync/database";
import { font, useColours } from "~/ui/theme";
import { AboutView } from "./about-view";
import { AccountView } from "./account-view";
import { AppearanceView } from "./appearance-view";
import { CalendarView } from "./calendar-view";
import { ConnectionsView } from "./connections-view";
import { DataView } from "./data-view";
import { HoursView } from "./hours-view";
import { NotificationsView } from "./notifications-view";
import { SectionFrame } from "./parts";
import { PlanningView } from "./planning-view";
import { phoneSection } from "./sections";
import { usePhoneExport } from "./use-phone-export";
import { useSettings, type SettingsData } from "./use-settings";

/** The phone's way to the server where the shared code would use the browser's fetch: its own call, with the session's token (api.ts). */
const askServer: typeof fetch = (input, init) => apiFetch(String(input), init ?? {});

/** The settings row has been read: every section but About and Connected apps waits for it. */
type Ready = SettingsData & { values: NonNullable<SettingsData["values"]> };

export function SettingsSection() {
  const params = useLocalSearchParams<{ section: string }>();
  const key = phoneSection(params.section);
  const data = useSettings();
  if (!key) return <Redirect href="/settings" />;
  const ready = data.values ? (data as Ready) : null;
  const body = () => {
    switch (key) {
      case "connections":
        return <ConnectionsSection />;
      case "about":
        return <AboutView version={BUILD} onPrivacy={() => void Linking.openURL(`${config.appUrl}/privacy`).catch(() => undefined)} />;
    }
    if (!ready) return <Opening />;
    switch (key) {
      case "account":
        return <AccountSection data={ready} />;
      case "working-hours":
        return <HoursView values={ready.values} workHours={ready.workHours} onChange={ready.change} onWorkHours={ready.setWorkHours} />;
      case "calendar":
        return <CalendarSection />;
      case "notifications":
        return <NotificationsSection data={ready} />;
      case "planning":
        return <PlanningSection data={ready} />;
      case "appearance":
        return <AppearanceView look={ready.values.look} theme={ready.values.theme} motion={ready.motion.value} onLook={(look) => ready.change({ look })} onTheme={(theme) => ready.change({ theme })} onMotion={ready.motion.onChange} />;
      case "data":
        return <DataSection data={ready} />;
    }
  };
  return <SectionFrame title={sectionTitle(key)}>{body()}</SectionFrame>;
}

function Opening() {
  const c = useColours();
  return <Text style={{ fontFamily: font.regular, fontSize: 16, marginHorizontal: 22, color: c.ink3 }}>Opening…</Text>;
}

/** The account's reminder settings, and this device's own reminders (~/push): turned on and off here, a block lifted in Android's settings. */
function NotificationsSection({ data }: { data: Ready }) {
  const r = useReminders();
  return (
    <NotificationsView
      values={data.values}
      workHours={data.workHours}
      onChange={data.change}
      device={r.ready ? { copy: r.copy, busy: r.busy, error: r.error, onEnable: () => void r.enable(), onDisable: () => void r.disable(), onOpenSettings: () => void Linking.openSettings().catch(() => undefined) } : null}
    />
  );
}

function PlanningSection({ data }: { data: Ready }) {
  // What tasks finished without an estimate really took, when that is not the default they are counted as
  // (DECISIONS.md, amendment 2026-11-15): one tap makes it the default.
  const usual = suggestDefault(useLearned(askServer), data.values.defaultEstimateMin);
  return <PlanningView values={data.values} usual={usual?.minutes ?? null} onChange={data.change} />;
}

/** Exported for its test: the ways out to a consent screen, and what each comes back as. */
export function CalendarSection() {
  const db = useLocalDatabase() as LocalDatabase;
  const repo = useMemo(() => new CalendarRepo(db), [db]);
  const { data: connectionRows } = useQuery<CalendarConnectionRow>(CALENDAR_CONNECTIONS_SQL);
  const { data: calendarRows } = useQuery<CalendarFullRow>(CALENDARS_FULL_SQL);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const accounts = useMemo(() => (connectionRows ?? []).map(toAccountView), [connectionRows]);
  const calendars = useMemo(() => (calendarRows ?? []).map(toCalendarView), [calendarRows]);
  const connecting = useCalendarConnect();
  const during = (work: Promise<string>) => {
    setBusy(true);
    void work.then(setNotice).finally(() => setBusy(false));
  };
  // The consent runs in the system browser and comes back here. What it came to is said in the web's own words; the
  // account and its calendars then arrive by sync, as they do on the web after its redirect.
  const consent = (provider: CalendarProviderId, purpose: ConnectPurpose) =>
    during(
      connecting.connect(provider, purpose).then(
        (outcome) => appConnectNotice(outcome, purpose),
        () => appConnectNotice("failed", purpose),
      ),
    );
  return (
    <CalendarView
      accounts={accounts}
      calendars={calendars}
      configured={connecting.available ? connecting.available.google : null}
      outlook={connecting.available?.microsoft === true}
      notice={notice}
      busy={busy || connecting.busy}
      onConnect={(provider) => consent(provider, "read")}
      onAllowWrite={() => consent("google", "write")}
      onFullAccess={() => consent("google", "full")}
      // The one Sync now path, shared with the web (features/calendar/sync-now.ts).
      onSyncNow={() => during(calendarSyncNow(askServer).then((outcome) => outcome.message))}
      onDisconnect={(id) =>
        during(
          apiFetch("/api/calendar/disconnect", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) }).then(
            (res) => disconnectNotice(res.ok),
            () => disconnectNotice(false),
          ),
        )
      }
      onRead={(id, read) => void repo.setRead(id, read)}
      onPrivate={(id, isPrivate) => void repo.setPrivate(id, isPrivate)}
      onWriteTarget={(id) => void repo.setWriteTarget(id)}
    />
  );
}

function ConnectionsSection() {
  const { state, busy, error, load, change, disconnect } = useConnections(apiFetch);
  return (
    <ConnectionsView
      state={state}
      busy={busy}
      error={error}
      onRetry={() => void load()}
      onShare={(endpoint) => void Share.share({ message: endpoint }).catch(() => undefined)}
      onAccess={(app, access) => void change(app, access)}
      onDisconnect={(app) => void disconnect(app)}
    />
  );
}

function DataSection({ data }: { data: Ready }) {
  const db = useLocalDatabase() as LocalDatabase;
  const undo = useUndoSink();
  const exporter = usePhoneExport();
  const router = useRouter();
  const { timezone, dayRolloverHour } = data.values;
  const { data: archived } = useQuery<ArchivedRow>(ARCHIVED_SQL);
  const { data: dropped } = useQuery<{ id: string }>(DROPPED_SQL);
  const today = todayFor({ timezone, dayRolloverHour }, Temporal.Now.instant());
  const batches = useMemo(() => groupBatches(archived ?? [], timezone), [archived, timezone]);
  const archivedIds = useMemo(() => (archived ?? []).map((r) => r.id), [archived]);
  const droppedIds = useMemo(() => (dropped ?? []).map((r) => r.id), [dropped]);
  return (
    <DataView
      exporter={{ busy: exporter.busy, error: exporter.error, lastFile: exporter.lastFile, onExport: (format) => void exporter.exportData(format) }}
      batches={batches}
      today={today}
      archivedIds={archivedIds}
      droppedIds={droppedIds}
      // Clear the slate is a screen of its own (/slate), as it is a sheet of its own on the web.
      onClearSlate={() => router.push("/slate")}
      // Records its own undo: the app's toast offers it.
      onRestore={(batch) => restoreBatch(db, undo ?? undefined, batch.key)}
      // The one hard delete, done by the server as the signed-in person; it has no undo.
      onDeletePermanently={(ids) => deletePermanently(ids, askServer)}
    />
  );
}

/** The sign-in methods linked to the account, from the auth server; the session this phone holds answers when it cannot be reached. */
async function loadSignInMethods(): Promise<string[]> {
  const auth = supabase().auth;
  const { data, error } = await auth.getUserIdentities();
  if (!error && data) return signInMethodLabels(data.identities);
  const held = (await auth.getSession()).data.session?.user.identities;
  if (held?.length) return signInMethodLabels(held);
  throw error ?? new Error("No sign-in methods");
}

/** Exported for its test: the two ways out of the account, which nothing brings back. */
export function AccountSection({ data }: { data: Ready }) {
  const db = useLocalDatabase() as LocalDatabase;
  const exporter = usePhoneExport();
  const [methods, setMethods] = useState<string[] | "unknown" | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [unsynced, setUnsynced] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    loadSignInMethods().then(
      (m) => live && setMethods(m),
      () => live && setMethods("unknown"),
    );
    return () => {
      live = false;
    };
  }, []);

  async function leave(anyway = false) {
    setLeaving(true);
    if (anyway) setUnsynced(null);
    try {
      if (!anyway) {
        // Clearing the phone with changes still queued would lose them without a word: say so and let the person choose.
        const waiting = await waitForUploads(db, () => db.currentStatus?.connected === true);
        if (waiting > 0) {
          setUnsynced(waiting);
          setLeaving(false);
          return;
        }
      }
      // This phone's reminders stop first, while the session can still say so to the server (~/push/device.ts).
      await forgetReminders();
      // Clears the phone's copy and ends its session; the app's frame then shows the sign-in screen.
      await signOut();
    } catch {
      setLeaving(false);
    }
  }

  const deleteAccount = async (): Promise<string | null> => {
    let after: string;
    try {
      after = await requestAccountDeletion(askServer);
    } catch (e) {
      return e instanceof Error && e.message ? e.message : DELETE_ACCOUNT.failed;
    }
    // The account is already marked and signed out everywhere: say the day it goes (the web's /account/deleted page
    // says the same), then leave this phone as signing out does, whatever fails on the way.
    Alert.alert(deletedHeadline(deletionDay(after)), DELETED_SIGNED_OUT);
    await forgetReminders();
    await signOut().catch(() => undefined);
    return null;
  };

  return (
    <AccountView
      account={{ name: data.user?.name ?? null, email: data.user?.email ?? null, avatarUrl: data.user?.avatarUrl ?? null }}
      methods={methods}
      timezone={data.values.timezone}
      detectedTimeZone={data.detectedTimeZone}
      onTimeZone={(timezone) => data.change({ timezone })}
      onSignOut={() => void leave()}
      signingOut={leaving}
      unsynced={unsynced}
      onSignOutAnyway={() => void leave(true)}
      onStaySignedIn={() => setUnsynced(null)}
      exporter={{ onExport: () => void exporter.exportData("json"), busy: exporter.busy !== null, error: exporter.error, lastFile: exporter.lastFile }}
      onDeleteAccount={deleteAccount}
    />
  );
}
