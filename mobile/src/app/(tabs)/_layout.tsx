// The four tabs (DESIGN_SYSTEM.md §4a): a tab's screen over the tab bar. Pushed screens (a task, a project, Settings)
// live outside this group and cover the bar.
import { Slot } from "expo-router";
import { View } from "react-native";
import { TabBar } from "~/ui/tab-bar";
import { useColours } from "~/ui/theme";

export default function TabsLayout() {
  const c = useColours();
  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      <View style={{ flex: 1 }}>
        <Slot />
      </View>
      <TabBar />
    </View>
  );
}
