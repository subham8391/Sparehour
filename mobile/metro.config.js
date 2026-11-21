// Metro for the Android app (docs/mobile/ANDROID_APP_SPEC.md §4). The app shares the web app's rules and data layer
// by reading them where they are, in ../src: nothing is copied, so a rule cannot differ between the two.
//
// - `@/…` is the shared source (../src/…), as inside the web app; `~/…` is this app's own source (./src/…).
// - The web app's one sync adapter (../src/data/powersync/index.ts, the only place that knows the sync engine) is
//   swapped for this app's (./src/sync/adapter.ts), however a shared file reaches it. That is the whole seam.
// - Every package comes from this folder's node_modules, never the web app's: two copies of React is a crash.
const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const root = __dirname;
const shared = path.resolve(root, "../src");
const WEB_ADAPTER = path.join(shared, "data", "powersync", "index.ts");
const APP_ADAPTER = path.join(root, "src", "sync", "adapter.ts");

const config = getDefaultConfig(root);
config.watchFolders = [shared];
config.resolver.nodeModulesPaths = [path.join(root, "node_modules")];
config.resolver.disableHierarchicalLookup = true;

// Looking up the folder tree is off, so a shared file in ../src can never pick up the web app's packages. A package
// in this folder's node_modules still gets its own nested ones first (reanimated ships a newer `semver` than the
// one at the top): every `node_modules` between the asking file and this folder's, nearest first.
const TOP = path.join(root, "node_modules");
function nestedFirst(context) {
  const from = context.originModulePath;
  if (!from || !from.startsWith(TOP + path.sep)) return context;
  const nested = [];
  for (let dir = path.dirname(from); dir.length > TOP.length; dir = path.dirname(dir)) {
    if (path.basename(dir) !== "node_modules") nested.push(path.join(dir, "node_modules"));
  }
  return { ...context, nodeModulesPaths: [...nested, ...context.nodeModulesPaths] };
}

config.resolver.resolveRequest = (context, moduleName, platform) => {
  let name = moduleName;
  if (name.startsWith("@/")) name = path.join(shared, name.slice(2));
  else if (name.startsWith("~/")) name = path.join(root, "src", name.slice(2));
  const resolved = context.resolveRequest(nestedFirst(context), name, platform);
  if (resolved.type === "sourceFile" && resolved.filePath === WEB_ADAPTER) return { type: "sourceFile", filePath: APP_ADAPTER };
  return resolved;
};

module.exports = config;
