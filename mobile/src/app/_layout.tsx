// The app's one frame (ANDROID_APP_SPEC.md §4): who is signed in, their local database, then the screens. Signed
// out, the sign-in screen stands in for every route; signed in, nothing is drawn until the copy on the phone is
// known to be this person's own.
import { Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider, useSession } from "~/auth/session";
import { missingConfig } from "~/config";
import { SignIn } from "~/screens/sign-in";
import { SyncProvider } from "~/sync/database";
import { useColours } from "~/ui/theme";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <SessionProvider>
        <Gate />
      </SessionProvider>
    </SafeAreaProvider>
  );
}

function Gate() {
  const c = useColours();
  const session = useSession();
  const missing = missingConfig();
  if (missing.length > 0) return <Notice title="This build is not set up" body={`Missing: ${missing.join(", ")}. Set them in mobile/.env and build again.`} />;
  // The device is still being read: paper, not a sign-in screen that goes away again.
  if (session === undefined) return <View style={[styles.fill, { backgroundColor: c.paper }]} />;
  if (session === null) return <SignIn />;
  return (
    <SyncProvider userId={session.user.id} failed={() => <Notice title="Your data could not be opened" body="Close the app and open it again. If it stays like this, sign in again." />}>
      <Slot />
    </SyncProvider>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  const c = useColours();
  return (
    <View style={[styles.fill, styles.notice, { backgroundColor: c.paper }]}>
      <Text accessibilityRole="header" style={[styles.noticeTitle, { color: c.ink }]}>
        {title}
      </Text>
      <Text style={[styles.noticeBody, { color: c.ink2 }]}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  notice: { justifyContent: "center", padding: 24, gap: 8 },
  noticeTitle: { fontSize: 22, fontWeight: "700" },
  noticeBody: { fontSize: 17, lineHeight: 24 },
});
