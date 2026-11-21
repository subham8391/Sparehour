// The tabs in the browser preview: the same frame as _layout.tsx without the Inbox count, which is read from the
// phone's database and the browser has none.
import { Slot } from "expo-router";
import { View } from "react-native";
import { TabBar } from "~/ui/tab-bar";
import { useColours } from "~/ui/theme";

export default function TabsPreviewLayout() {
  const c = useColours();
  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      <View style={{ flex: 1 }}>
        <Slot />
      </View>
      <TabBar inboxCount={3} />
    </View>
  );
}
