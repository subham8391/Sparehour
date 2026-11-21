// The app's one frame (ANDROID_APP_SPEC.md §4): the typeface, who is signed in, their local database, then the
// screens over the tab bar. Signed out, the sign-in screen stands in for every route; signed in, nothing is drawn
// until the copy on the phone is known to be this person's own.
import { Slot } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider, useSession } from "~/auth/session";
import { missingConfig } from "~/config";
import { SignIn } from "~/screens/sign-in";
import { SyncProvider } from "~/sync/database";
import { useAppFonts } from "~/ui/fonts";
import { TabBar } from "~/ui/tab-bar";
import { font, useColours } from "~/ui/theme";

// The splash stays until the typeface is in, so the first frame is already in the app's own letters.
void SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const fonts = useAppFonts();
  useEffect(() => {
    if (fonts) void SplashScreen.hideAsync().catch(() => undefined);
  }, [fonts]);
  if (!fonts) return null;
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
  if (missing.length > 0) return <Notice title="This build is not set up" body={`Missing: ${missing.join(", ")}. Set them for the build and build again.`} />;
  // The device is still being read: paper, not a sign-in screen that goes away again.
  if (session === undefined) return <View style={[styles.fill, { backgroundColor: c.paper }]} />;
  if (session === null) return <SignIn />;
  return (
    <SyncProvider userId={session.user.id} failed={() => <Notice title="Your data could not be opened" body="Close the app and open it again. If it stays like this, sign in again." />}>
      <View style={[styles.fill, { backgroundColor: c.paper }]}>
        <View style={styles.fill}>
          <Slot />
        </View>
        <TabBar />
      </View>
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
  noticeTitle: { fontFamily: font.bold, fontSize: 22 },
  noticeBody: { fontFamily: font.regular, fontSize: 17, lineHeight: 24 },
});
