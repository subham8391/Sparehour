// The icon's shortcuts: the build is given the web manifest's own list (app.json must not drift from
// ../../../src/features/pwa/shortcuts.ts), each opens the place the web's opens, and the share target takes text.
import { SHORTCUTS } from "@/features/pwa/shortcuts";
import { opening } from "./opening";

interface Shortcut {
  name: string;
  short_name: string;
  url: string;
}
interface Plugin {
  shortcutId: (name: string) => string;
  shortcutAddress: (scheme: string, url: string) => string;
  shortcutStrings: (shortcuts: readonly Shortcut[]) => { name: string; value: string }[];
  shortcutsXml: (p: { shortcuts: readonly Shortcut[]; scheme: string; androidPackage: string }) => string;
}
const plugin = jest.requireActual("../../plugins/app-shortcuts") as Plugin;
const app = (jest.requireActual("../../app.json") as { expo: { scheme: string; android: { package: string }; plugins: (string | [string, Record<string, unknown>])[] } }).expo;
const propsOf = (name: string) => (app.plugins.find((p) => Array.isArray(p) && p[0] === name) as [string, Record<string, unknown>] | undefined)?.[1];
const inBuild = (propsOf("./plugins/app-shortcuts") as { shortcuts: Shortcut[] }).shortcuts;

describe("the icon's shortcuts", () => {
  it("are the web manifest's, by name, short name and address, in its order", () => {
    expect(inBuild).toEqual(SHORTCUTS);
  });

  it("each opens what the web's opens: Add a task is Today with quick add open and empty, Today is Today", () => {
    const opened = Object.fromEntries(inBuild.map((s) => [s.name, opening(plugin.shortcutAddress(app.scheme, s.url), () => "")]));
    expect(opened).toEqual({ "Add a task": { to: "/", quickAdd: {} }, Today: { to: "/" } });
  });

  it("are written for Android as fixed shortcuts that open the app at the web's address under its own scheme", () => {
    expect(plugin.shortcutAddress("sparehour", "/today?quickadd=1")).toBe("sparehour://today?quickadd=1");
    const xml = plugin.shortcutsXml({ shortcuts: inBuild, scheme: app.scheme, androidPackage: app.android.package });
    expect(xml).toContain('android:shortcutId="add_a_task"');
    expect(xml).toContain('android:shortcutShortLabel="@string/shortcut_add_a_task_short" android:shortcutLongLabel="@string/shortcut_add_a_task_long"');
    expect(xml).toContain('<intent android:action="android.intent.action.VIEW" android:targetPackage="com.sparehour.app" android:targetClass="com.sparehour.app.MainActivity" android:data="sparehour://today?quickadd=1" />');
    expect(xml).toContain('android:data="sparehour://today" />');
    // Add a task comes first, as in the manifest.
    expect(xml.indexOf("add_a_task")).toBeLessThan(xml.indexOf('shortcutId="today"'));
    expect(plugin.shortcutStrings(inBuild)).toEqual([
      { name: "shortcut_add_a_task_short", value: "Add" },
      { name: "shortcut_add_a_task_long", value: "Add a task" },
      { name: "shortcut_today_short", value: "Today" },
      { name: "shortcut_today_long", value: "Today" },
    ]);
  });

  it("an address with an ampersand, and a label with a quote, are written safely", () => {
    const odd = [{ name: "Tomorrow's plan", short_name: "Plan", url: "/today?a=1&b=2" }];
    expect(plugin.shortcutsXml({ shortcuts: odd, scheme: "sparehour", androidPackage: "com.sparehour.app" })).toContain('android:data="sparehour://today?a=1&amp;b=2"');
    expect(plugin.shortcutStrings(odd)[1]).toEqual({ name: "shortcut_tomorrow_s_plan_long", value: "Tomorrow\\'s plan" });
  });
});

describe("Share to Sparehour", () => {
  it("the build takes text shared from another app, and only text", () => {
    expect(propsOf("expo-sharing")).toEqual({ android: { enabled: true, singleShareMimeTypes: ["text/plain"] } });
  });

  it("the app has the scheme a share and a shortcut open it with", () => {
    expect(app.scheme).toBe("sparehour");
  });
});
