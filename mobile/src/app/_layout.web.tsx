// The browser preview's frame (npm run preview). The browser is not a place the app ships to: it has no phone
// database and no sign-in. It exists so a screen can be looked at while it is being built, with made-up data
// (index.web.tsx). Nothing here reaches the Android build.
import { Slot } from "expo-router";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useAppFonts } from "~/ui/fonts";
import { TabBar } from "~/ui/tab-bar";

export default function PreviewLayout() {
  if (!useAppFonts()) return null;
  return (
    <SafeAreaProvider>
      <View style={{ flex: 1 }}>
        <View style={{ flex: 1 }}>
          <Slot />
        </View>
        <TabBar />
      </View>
    </SafeAreaProvider>
  );
}
