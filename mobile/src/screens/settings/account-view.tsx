// Settings › Account on the phone (SCREENS.md §18; the web's sections/account-section.tsx and
// features/account/delete-account-sheet.tsx): who is signed in (the picture or the initials, the name and email,
// the sign-in methods linked to the account), the time zone with its "Detected …" hint, and the ways out: Sign out,
// which says so when changes have not reached the account yet, and Delete account behind the typed confirmation,
// which states exactly what goes and offers the export first. Deleting the account has no undo, on the web as
// here. The zones, the hint and every sentence are the web's own (features/settings/settings-rules.ts,
// section-words.ts, features/account/leaving.ts, deletion.ts). Presentational.
import { useMemo, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { Text } from "~/ui/text";
import { DELETED_THINGS, DELETE_ACCOUNT } from "@/features/account/deletion";
import { initials } from "@/features/account/identity";
import { SIGN_OUT_NOTE, UNSYNCED_NOTE, loseLabel, unsyncedLine } from "@/features/account/leaving";
import { useSavedFlash } from "@/features/settings/saved-flash";
import { DELETE_ACCOUNT_NOTE, SIGN_IN_METHODS_OFFLINE, zoneOffer } from "@/features/settings/section-words";
import { canonicalZone, timeZoneHint, timeZoneOptions } from "@/features/settings/settings-rules";
import { Button } from "~/ui/button";
import { CardRow } from "~/ui/card";
import { MenuRow } from "~/ui/menu-row";
import { Sheet } from "~/ui/sheet";
import { TextField } from "~/ui/text-field";
import { font, useColours } from "~/ui/theme";
import { Group, Line, SettingRow, TypedConfirmSheet, Words } from "./parts";

export interface AccountViewProps {
  account: { name: string | null; email: string | null; avatarUrl?: string | null };
  /** The sign-in methods linked to the account; null while they are asked for, "unknown" when they could not be. */
  methods: readonly string[] | "unknown" | null;
  timezone: string;
  /** The zone this phone is in. */
  detectedTimeZone: string | null;
  onTimeZone: (zone: string) => void;
  onSignOut: () => void;
  signingOut?: boolean;
  /** Changes that have not reached the account yet, when signing out would lose them; null when there are none. */
  unsynced?: number | null;
  onSignOutAnyway: () => void;
  onStaySignedIn: () => void;
  /** The export offered before deleting: the JSON of everything. */
  exporter: { onExport: () => void; busy: boolean; error: string | null; lastFile: string | null };
  /** Asks the server to delete the account and leaves this phone; resolves a sentence to show when it could not. */
  onDeleteAccount: () => Promise<string | null>;
}

/** How many zones the sheet lists at once; typing narrows them. */
const SHOWN_ZONES = 40;

export function AccountView(p: AccountViewProps) {
  const c = useColours();
  const [saved, flash] = useSavedFlash();
  const [zonesOpen, setZonesOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [broken, setBroken] = useState<string | null>(null);
  const hint = timeZoneHint(p.timezone, p.detectedTimeZone);
  const setZone = (zone: string) => {
    p.onTimeZone(zone);
    flash();
  };
  const picture = p.account.avatarUrl && broken !== p.account.avatarUrl ? p.account.avatarUrl : null;
  return (
    <>
      <Group saved={saved}>
        <CardRow first>
          <View style={styles.who}>
            {/* Decorative: the name beside it says who it is. A picture that fails to load falls back to the initials. */}
            <View aria-hidden style={[styles.avatar, { backgroundColor: c.surface2 }]}>
              {picture ? <Image source={{ uri: picture }} onError={() => setBroken(picture)} style={styles.avatarImage} /> : <Text style={[styles.initials, { color: c.ink2 }]}>{initials(p.account.name, p.account.email) || "·"}</Text>}
            </View>
            <View style={styles.whoWords}>
              <Text numberOfLines={1} style={[styles.name, { color: c.ink }]}>
                {p.account.name ?? "You"}
              </Text>
              <Text numberOfLines={1} style={[styles.email, { color: c.ink2 }]}>
                {p.account.email ?? "—"}
              </Text>
            </View>
          </View>
        </CardRow>
        <CardRow>
          {p.methods === null ? (
            <SettingRow label="Signed in with" value="Checking…" quiet />
          ) : p.methods === "unknown" || p.methods.length === 0 ? (
            <SettingRow label="Signed in with" value={SIGN_IN_METHODS_OFFLINE} quiet />
          ) : (
            <SettingRow label="Signed in with" value={p.methods.join(" · ")} />
          )}
        </CardRow>
        <CardRow>
          <SettingRow label="Time zone" value={p.timezone} onPress={() => setZonesOpen(true)} />
          {hint && p.detectedTimeZone ? <Button variant="quiet" label={zoneOffer(hint)} onPress={() => setZone(canonicalZone(p.detectedTimeZone as string))} style={styles.offer} /> : null}
        </CardRow>
      </Group>

      <View style={styles.out}>
        {p.unsynced ? (
          // Signing out clears this phone; anything not uploaded yet would go with it (PRODUCT_SPEC.md §5.4: offline work is kept).
          <View accessibilityRole="alert" style={styles.gap}>
            <Words text={unsyncedLine(p.unsynced)} strong />
            <Line text={UNSYNCED_NOTE} flush />
            <View style={styles.buttons}>
              <Button label="Stay signed in" onPress={p.onStaySignedIn} />
              <Button destructive label={loseLabel(p.unsynced)} disabled={p.signingOut} onPress={p.onSignOutAnyway} />
            </View>
          </View>
        ) : (
          <>
            <Button label={p.signingOut ? "Signing out…" : "Sign out"} disabled={p.signingOut} onPress={p.onSignOut} style={styles.start} />
            <Line text={SIGN_OUT_NOTE} flush />
          </>
        )}
      </View>

      <View style={styles.out}>
        <Button destructive label="Delete account" onPress={() => setDeleting(true)} style={styles.start} />
        <Line text={DELETE_ACCOUNT_NOTE} flush />
      </View>

      <ZoneSheet open={zonesOpen} current={p.timezone} onPick={setZone} onClose={() => setZonesOpen(false)} />
      <TypedConfirmSheet open={deleting} title={DELETE_ACCOUNT.title} confirmLabel={DELETE_ACCOUNT.confirm} busyLabel={DELETE_ACCOUNT.busy} onConfirm={p.onDeleteAccount} onClose={() => setDeleting(false)}>
        <Words text={DELETED_THINGS} strong />
        <Words text={DELETE_ACCOUNT.after} />
        <View style={styles.gap}>
          <Button label={p.exporter.busy ? "Preparing…" : DELETE_ACCOUNT.exportFirst} disabled={p.exporter.busy} onPress={p.exporter.onExport} style={styles.start} />
          <Line text={DELETE_ACCOUNT.exportNote} flush />
          {p.exporter.lastFile ? <Line text={`Prepared ${p.exporter.lastFile}`} status flush /> : null}
          {p.exporter.error ? <Line text={p.exporter.error} tone="error" flush /> : null}
        </View>
      </TypedConfirmSheet>
    </>
  );
}

/** The time zones as a sheet: the web's own list (`timeZoneOptions`), narrowed by typing. */
function ZoneSheet({ open, current, onPick, onClose }: { open: boolean; current: string; onPick: (zone: string) => void; onClose: () => void }) {
  return (
    <Sheet open={open} title="Time zone" onClose={onClose} footer={<Button variant="quiet" label="Cancel" onPress={onClose} />}>
      {open ? <ZoneList current={current} onPick={onPick} onClose={onClose} /> : null}
    </Sheet>
  );
}

function ZoneList({ current, onPick, onClose }: { current: string; onPick: (zone: string) => void; onClose: () => void }) {
  const c = useColours();
  const [typed, setTyped] = useState("");
  const zones = useMemo(() => timeZoneOptions(current), [current]);
  const asked = typed.trim().toLowerCase().replace(/\s+/g, "_");
  const matching = asked ? zones.filter((z) => z.toLowerCase().includes(asked)) : zones;
  // The zone already chosen leads, so it is in sight before anything is typed.
  const listed = asked ? matching : [current, ...matching.filter((z) => z !== current)];
  return (
    <View style={styles.gap}>
      <TextField accessibilityLabel="Find a time zone" placeholder="Find a time zone" value={typed} onChangeText={setTyped} autoCapitalize="none" autoCorrect={false} />
      <View>
        {listed.slice(0, SHOWN_ZONES).map((z) => (
          <MenuRow
            key={z}
            label={z}
            current={z === current}
            onPress={() => {
              if (z !== current) onPick(z);
              onClose();
            }}
          />
        ))}
      </View>
      {listed.length === 0 ? <Text style={[styles.more, { color: c.ink2 }]}>No time zone by that name.</Text> : null}
      {listed.length > SHOWN_ZONES ? <Text style={[styles.more, { color: c.ink3 }]}>{`${listed.length - SHOWN_ZONES} more. Type to find one.`}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  who: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarImage: { width: 40, height: 40 },
  initials: { fontFamily: font.medium, fontSize: 16 },
  whoWords: { flex: 1 },
  name: { fontFamily: font.medium, fontSize: 17, lineHeight: 23 },
  email: { fontFamily: font.regular, fontSize: 16, lineHeight: 22 },
  offer: { alignSelf: "flex-start", marginLeft: 4, marginBottom: 6 },
  out: { marginHorizontal: 16, marginTop: 28, gap: 8 },
  gap: { gap: 10 },
  buttons: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  start: { alignSelf: "flex-start" },
  more: { fontFamily: font.regular, fontSize: 14, lineHeight: 20 },
});
