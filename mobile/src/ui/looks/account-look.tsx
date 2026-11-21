// Appearance is an account setting (SCREENS.md §18; DECISIONS.md, amendment 2026-10-20): the theme and the look
// follow the person to every device. The phone draws from its own copy (theme-choice.ts, look-choice.ts), which is
// there before the first frame; this brings the copy up to date once the settings row is here, and again whenever
// another device changes it. The web does the same in ../../../../src/features/commands/keyboard-provider.tsx.
// Mounted once, under the database, in the app's frame. Draws nothing.
import { useEffect } from "react";
import { useQuery } from "@/data/powersync";
import { SETTINGS_SQL } from "@/data/queries/today";
import type { UserSettingsRow } from "@/data/schema.client";
import { settingsValues } from "@/features/settings/settings-values";
import { setThemeChoice, themeChoice } from "../theme-choice";
import { lookChoice, setLookChoice } from "./look-choice";

export function AccountLook(): null {
  const { data } = useQuery<UserSettingsRow & { id: string }>(SETTINGS_SQL);
  const row = data?.[0];
  // How the row reads (an empty or unknown theme is System, anything that is not a look's id is Sky) is the web's own.
  const account = row ? settingsValues(row) : null;
  const theme = account?.theme ?? null;
  const look = account?.look ?? null;
  useEffect(() => {
    if (theme && theme !== themeChoice()) setThemeChoice(theme);
  }, [theme]);
  useEffect(() => {
    if (look && look !== lookChoice()) setLookChoice(look);
  }, [look]);
  return null;
}
