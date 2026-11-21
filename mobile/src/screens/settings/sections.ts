// Which of Settings' sections the phone has (SCREENS.md §18; the web's list is features/settings/sections.ts): all
// of them but App. Installing the app and whether the browser protects its storage are the web app's own concerns;
// the version it also shows is in About. The order, the names and the summaries are the web's.
import { SECTIONS, type SectionKey, type SectionMeta } from "@/features/settings/sections";

export type PhoneSectionKey = Exclude<SectionKey, "app">;

export const PHONE_SECTIONS = SECTIONS.filter((s): s is SectionMeta & { key: PhoneSectionKey } => s.key !== "app");

/** The section an address names (/settings/calendar), or null for the list; unknown names are the list too, as on the web. */
export function phoneSection(name: string | string[] | undefined): PhoneSectionKey | null {
  const key = Array.isArray(name) ? name[0] : name;
  return PHONE_SECTIONS.find((s) => s.key === key)?.key ?? null;
}
