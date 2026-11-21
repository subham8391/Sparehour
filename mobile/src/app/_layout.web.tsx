// The browser preview's frame (npm run preview). The browser is not a place the app ships to: it has no phone
// database and no sign-in. It exists so a screen can be looked at while it is being built, with made-up data
// (index.web.tsx). Nothing here reaches the Android build.
import { Slot } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useAppFonts } from "~/ui/fonts";

export default function PreviewLayout() {
  if (!useAppFonts()) return null;
  return (
    <SafeAreaProvider>
      <Slot />
    </SafeAreaProvider>
  );
}
