// The phone's own bars follow the look (DECISIONS.md, amendment 2026-10-20: the browser's chrome does the same on
// the web through its theme-color). Android draws the app edge to edge: the status bar and the bottom strip have no
// colour of their own, so what shows there is the app's root view, and the only thing to choose is whether the
// status bar's clock and icons are light or dark. Both are set from the look's page colour in the theme on screen:
// - the root view's background (expo-system-ui), which is behind the status bar, the bottom strip, and every screen
//   while it slides in. It is set as the app opens, behind the splash; the splash itself is the build's own
//   (app.json: Sky's page) and cannot follow a look;
// - the status bar's style (expo-status-bar), light on a dark page and dark on a light one. A look's page can be
//   dark in the light theme (Terminal, Blueprint), so this cannot be left to the theme.
// - the bottom strip's own buttons (three-button navigation) and handle (expo-navigation-bar), by the same rule.
import { NavigationBar } from "expo-navigation-bar";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { Appearance } from "react-native";
import { luminance } from "@/features/looks/contrast";
import { schemeNow, useColours } from "../theme";
import { subscribeThemeChoice } from "../theme-choice";
import { lookChoice, subscribeLookChoice, tokensOf } from "./look-choice";

/** A page dark enough that white reads better on it than black (WCAG contrast against each). */
export function darkPage(paper: string): boolean {
  if (!/^#[0-9a-f]{6}$/i.test(paper)) return false;
  const l = luminance(paper);
  return 1.05 / (l + 0.05) > (l + 0.05) / 0.05;
}

/** The page colour of the look and theme on screen now. */
export function pageNow(): string {
  return tokensOf(lookChoice())[schemeNow(Appearance.getColorScheme())].colours.paper;
}

function tell(): void {
  const paper = pageNow();
  try {
    void SystemUI.setBackgroundColorAsync(paper).catch(() => undefined);
    StatusBar.setStyle(darkPage(paper) ? "light" : "dark");
  } catch {
    // Not every platform has bars to tell (the browser preview, a test); the app's own colours follow regardless.
  }
}

/**
 * Tells the phone now, and again whenever the look, the theme or the phone's own light/dark changes. Returns the way
 * to stop. Started once, as the app opens (ui/fonts.ts).
 */
export function watchSystemBars(): () => void {
  let later: ReturnType<typeof setTimeout> | null = null;
  const changed = () => {
    tell();
    // A <StatusBar style="auto"> mounted in the app's frame answers the same change a moment later with the theme's
    // style; saying it once more afterwards keeps the look's. Nothing to do where <SystemBars /> is mounted instead.
    if (later) clearTimeout(later);
    later = setTimeout(tell, 250);
  };
  changed();
  const stops = [subscribeThemeChoice(changed), subscribeLookChoice(changed)];
  const system = Appearance.addChangeListener(changed);
  return () => {
    if (later) clearTimeout(later);
    stops.forEach((stop) => stop());
    system.remove();
  };
}

/**
 * The status bar's and the bottom strip's style for the look on screen, as a component: mounted in the app's frame in place of
 * `<StatusBar style="auto" />`, it holds the style through every redraw.
 */
export function SystemBars() {
  const c = useColours();
  const style = darkPage(c.paper) ? "light" : "dark";
  return (
    <>
      <StatusBar style={style} />
      <NavigationBar style={style} />
    </>
  );
}
