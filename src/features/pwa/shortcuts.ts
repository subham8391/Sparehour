// The installed app's shortcuts (a long press on its icon on Android, a right click on desktop): what each is called
// and the address it opens. The list alone, free of the manifest's web types (manifest.ts serves it to the browser),
// so the Android app's icon carries the same shortcuts under the same names (docs/mobile/ANDROID_APP_SPEC.md §4.3;
// mobile/app.json holds them for its build, and a test there fails when the two lists differ).
// `/today?quickadd=1` is Today with quick add open and empty (SCREENS.md §11 "the shortcut").
export interface AppShortcut {
  name: string;
  short_name: string;
  url: string;
}

export const SHORTCUTS: readonly AppShortcut[] = [
  { name: "Add a task", short_name: "Add", url: "/today?quickadd=1" },
  { name: "Today", short_name: "Today", url: "/today" },
];
