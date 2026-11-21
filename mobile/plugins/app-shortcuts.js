// The icon's shortcuts on Android (a long press on Sparehour's icon): the same ones the web app's manifest gives its
// installed app, under the same names, opening the same places. A config plugin, because the project's native folders
// are generated at build time (Continuous Native Generation) and Android reads its fixed shortcuts from the build:
// res/xml/shortcuts.xml, named by a <meta-data> on the main activity, with each label a string resource.
//
// The list is given in app.json, in the web manifest's own keys and with the web's own addresses:
//   ["./plugins/app-shortcuts", { "shortcuts": [{ "name": "Add a task", "short_name": "Add", "url": "/today?quickadd=1" }] }]
// It must be the list in ../src/features/pwa/shortcuts.ts; src/share/shortcuts.test.ts fails when the two differ.
// A shortcut opens the app at `<scheme>:/<url>` (sparehour://today?quickadd=1), and src/share/opening.ts says where
// each of those leads in this app. Each wears the app's own icon, as on the web.
const fs = require("fs");
const path = require("path");
const { AndroidConfig, withAndroidManifest, withDangerousMod, withStringsXml } = require("expo/config-plugins");

/** Android reads the shortcuts of an activity from the resource this names. */
const META_NAME = "android.app.shortcuts";
const RESOURCE = "shortcuts";

/** "Add a task" → "add_a_task": the shortcut's id, and the stem of its two label resources. */
function shortcutId(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** The address a shortcut opens the app with: the web's own, under the app's scheme. */
function shortcutAddress(scheme, url) {
  return `${scheme}:/${url.startsWith("/") ? url : `/${url}`}`;
}

const xml = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** A label as an Android string resource holds it: its own quotes and backslashes escaped. */
const resourceText = (text) => text.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, '\\"');

/** The label resources: `shortcut_<id>_short` (under the icon when pinned) and `shortcut_<id>_long` (in the list). */
function shortcutStrings(shortcuts) {
  return shortcuts.flatMap((s) => [
    { name: `shortcut_${shortcutId(s.name)}_short`, value: resourceText(s.short_name) },
    { name: `shortcut_${shortcutId(s.name)}_long`, value: resourceText(s.name) },
  ]);
}

/** res/xml/shortcuts.xml: one <shortcut> each, in the order given, opening the main activity at its address. */
function shortcutsXml({ shortcuts, scheme, androidPackage }) {
  const each = shortcuts.map((s) => {
    const id = shortcutId(s.name);
    return [
      `  <shortcut android:shortcutId="${id}" android:enabled="true" android:icon="@mipmap/ic_launcher" android:shortcutShortLabel="@string/shortcut_${id}_short" android:shortcutLongLabel="@string/shortcut_${id}_long">`,
      `    <intent android:action="android.intent.action.VIEW" android:targetPackage="${xml(androidPackage)}" android:targetClass="${xml(androidPackage)}.MainActivity" android:data="${xml(shortcutAddress(scheme, s.url))}" />`,
      `  </shortcut>`,
    ].join("\n");
  });
  return `<?xml version="1.0" encoding="utf-8"?>\n<shortcuts xmlns:android="http://schemas.android.com/apk/res/android">\n${each.join("\n")}\n</shortcuts>\n`;
}

function withAppShortcuts(config, props) {
  const shortcuts = (props && props.shortcuts) || [];
  const scheme = Array.isArray(config.scheme) ? config.scheme[0] : config.scheme;
  const androidPackage = config.android && config.android.package;
  if (!scheme || !androidPackage) throw new Error("app-shortcuts: the app config needs a `scheme` and an `android.package` for the shortcuts to open.");
  for (const s of shortcuts) {
    if (!s.name || !s.short_name || !s.url) throw new Error("app-shortcuts: every shortcut needs a `name`, a `short_name` and a `url`.");
  }

  config = withStringsXml(config, (c) => {
    c.modResults = AndroidConfig.Strings.setStringItem(
      shortcutStrings(shortcuts).map((item) => AndroidConfig.Resources.buildResourceItem(item)),
      c.modResults,
    );
    return c;
  });

  config = withAndroidManifest(config, (c) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(c.modResults);
    const others = (activity["meta-data"] || []).filter((m) => m.$["android:name"] !== META_NAME);
    activity["meta-data"] = shortcuts.length > 0 ? [...others, { $: { "android:name": META_NAME, "android:resource": `@xml/${RESOURCE}` } }] : others;
    return c;
  });

  return withDangerousMod(config, [
    "android",
    async (c) => {
      const dir = path.join(c.modRequest.platformProjectRoot, "app", "src", "main", "res", "xml");
      const file = path.join(dir, `${RESOURCE}.xml`);
      if (shortcuts.length === 0) {
        await fs.promises.rm(file, { force: true });
        return c;
      }
      await fs.promises.mkdir(dir, { recursive: true });
      await fs.promises.writeFile(file, shortcutsXml({ shortcuts, scheme, androidPackage }));
      return c;
    },
  ]);
}

module.exports = withAppShortcuts;
module.exports.shortcutId = shortcutId;
module.exports.shortcutAddress = shortcutAddress;
module.exports.shortcutStrings = shortcutStrings;
module.exports.shortcutsXml = shortcutsXml;
