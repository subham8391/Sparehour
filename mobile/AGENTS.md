This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md

## Sparehour

This folder is Sparehour's Android app. Read `../docs/mobile/ANDROID_APP_SPEC.md` first: it says what is shared with the web app, what is built here, and in which order.

- The rules and the data layer are not copied here. They are read from `../src` (`@/…`); this app's own code is `~/…`. Do not duplicate a rule, a query or a mapper into this folder: change it in `../src`, where the web app's tests cover it.
- `src/sync/adapter.ts` stands in for `../src/data/powersync/index.ts` (Metro and Jest swap it). Keep the two files' exports the same.
- Anything imported from `../src` must be free of web-only code (`next/*`, `@/ui/*`, the DOM). If a shared hook pulls one in, split the web part out in `../src`, as `features/undo/undo-context.ts` was.
- Checks: `npm run typecheck`, `npm test`, `npm run bundle` (builds the Android JavaScript bundle; proves the shared code resolves).

## Building a screen

Every screen is built the same way, so they read alike and can be checked alike. `src/screens/today*.tsx` is the worked example.

1. **Read the web's version first**: its page (`../src/app/(app)/<name>/page.tsx`), its features folder, and its section of `../docs/product/SCREENS.md` (the "Responsive" notes say what a phone does). The phone screen says and does what the web's does at phone width; only the layout and the touch are its own.
2. **Three files per screen**, in `src/screens/<name>/` (or `src/screens/<name>*.tsx` for a small one):
   - `<name>-view.tsx`: presentational. Props in, React Native out. No data hooks, no router, no repositories.
   - `<name>.tsx`: the container. It calls the shared hooks, queries and repositories and hands the view its props.
   - `<name>-view.test.tsx`: React Native Testing Library tests of the view (what it shows, what each control calls). Pure helpers get their own small file and a plain test.
3. **The route** is one line: `src/app/.../<name>.tsx` exports the container. Beside it, `<name>.web.tsx` draws the view with made-up data for the browser preview (`npm run preview`); it must not import the container, the sync folder or anything that reaches `@/data/powersync`.
4. **Text and TextInput come from `~/ui/text`**, never from `react-native` (a test fails otherwise): they draw in the chosen look's own typeface. Styles name `font.*` (`display` / `displayMedium` / `qualifier` / `control` for the web's `font-display`, `font-display-italic`, `control-type`); a page title or the "spare" word also takes `useWords()` from `theme.ts`.
5. **Use the shared parts** in `src/ui/`: `Screen` (the sky, header, Back), `Card` / `CardRow`, `SectionLabel`, `TaskLine`, `Chip`, `Button`, `Sheet`, `TextField`, `Empty`, `Icon`, and the tokens in `theme.ts` (`useColours`, `font`, `TARGET`). Do not restyle them per screen. If a screen needs a part that is missing, add it to `src/ui/` as a general part.
6. **Writes go through the shared repositories** (`../src/data/repositories`), built with the shared hooks (`useTaskRepo`, `useRepos`, `useBlockRepo`). They record their own undo, and the app's one toast offers it (`src/ui/undo-provider.tsx`): never write a second undo.
7. **Rules stay shared.** A sum, a sort, a parse, a date rule or a query the web already has is imported from `../src`, never written again here. If it sits inside a web page or beside web-only code, move it to a web-free file in `../src` and import it from both (run the web's `npx tsc --noEmit`, `npx eslint .` and the touched tests after).
8. **The product's own rules hold on the phone**: 44-point targets, a tap path for everything (no gesture-only action), only a missed deadline is red, "carried over" never "overdue", calm words. Every control has an accessibility label.
9. **Navigation**: `useRouter()` from `expo-router`; a pushed screen passes `back` to `Screen`. Addresses are plain strings (`/task/<id>`).
10. **Before calling it done**: `npm run typecheck`, `npm test`, `npm run bundle`, and look at the screen in the preview in light and dark.
