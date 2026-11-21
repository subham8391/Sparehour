// The time zones as a sheet (the web's is a select over the same list): the web's own list (`timeZoneOptions`,
// ../../../src/features/settings/settings-rules.ts), the zone already chosen first, narrowed by typing. Choosing one
// hands it back and closes. Nothing is written here.
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { timeZoneOptions } from "@/features/settings/settings-rules";
import { Button } from "./button";
import { MenuRow } from "./menu-row";
import { Sheet } from "./sheet";
import { TextField } from "./text-field";
import { font, useColours } from "./theme";

/** How many zones the sheet lists at once; typing narrows them. */
const SHOWN_ZONES = 40;

export function ZoneSheet({ open, title = "Time zone", current, onPick, onClose }: { open: boolean; title?: string; current: string; onPick: (zone: string) => void; onClose: () => void }) {
  return (
    <Sheet open={open} title={title} onClose={onClose} footer={<Button variant="quiet" label="Cancel" onPress={onClose} />}>
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
  gap: { gap: 10 },
  more: { fontFamily: font.regular, fontSize: 14, lineHeight: 20 },
});
