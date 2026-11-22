// An account waiting for deletion, as it is drawn (the web's app/account/deleted/page.tsx and
// features/account/restore-account.tsx, their words): the day it goes, Restore and Sign out. Props in, React Native
// out: what each button does is the container's (~/screens/account-deleted.tsx).
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { RESTORE, deletedHeadline } from "@/features/account/deletion";
import { Button } from "~/ui/button";
import { Text } from "~/ui/text";
import { font, useColours } from "~/ui/theme";

export interface AccountDeletedViewProps {
  /** "Tuesday 22 December 2026", or null when the date could not be read. */
  day: string | null;
  busy: "restore" | "leave" | null;
  error: string | null;
  onRestore: () => void;
  onSignOut: () => void;
}

export function AccountDeletedView({ day, busy, error, onRestore, onSignOut }: AccountDeletedViewProps) {
  const c = useColours();
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: c.paper }]}>
      <View style={styles.body}>
        <Text style={[styles.eyebrow, { color: c.ink3 }]}>ACCOUNT</Text>
        <Text accessibilityRole="header" style={[styles.title, { color: c.ink }]}>
          {deletedHeadline(day)}
        </Text>
        <Text style={[styles.line, { color: c.ink2 }]}>{RESTORE.body}</Text>
        <View style={styles.actions}>
          <Button variant="primary" label={busy === "restore" ? RESTORE.restoring : RESTORE.restore} onPress={onRestore} disabled={busy !== null} block />
          <Button variant="secondary" label={busy === "leave" ? RESTORE.signingOut : RESTORE.signOut} onPress={onSignOut} disabled={busy !== null} block />
        </View>
        {error ? (
          <Text accessibilityRole="alert" style={[styles.error, { color: c.deadline }]}>
            {error}
          </Text>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { flex: 1, justifyContent: "center", paddingHorizontal: 20, gap: 12 },
  eyebrow: { fontFamily: font.semibold, fontSize: 12, letterSpacing: 1.2 },
  title: { fontFamily: font.display, fontSize: 26, lineHeight: 32 },
  line: { fontFamily: font.regular, fontSize: 17, lineHeight: 24 },
  actions: { marginTop: 12, gap: 8 },
  error: { fontFamily: font.medium, fontSize: 15, lineHeight: 21 },
});
