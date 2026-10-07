"use client";
// Settings › About (SCREENS.md §18; ruled 2026-10-06): the version, a short
// What's new, the keyboard shortcuts where there is a keyboard to use them,
// and how your data is kept. No Contact row until there is an address to give.
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { useCommandsOptional } from "@/features/commands/keyboard-provider";
import { Button } from "@/ui/button";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/icons";
import { ListCard } from "@/ui/list-card";
import { SectionLabel } from "@/ui/section-label";
import { CHANGELOG } from "../changelog";
import { HINT, LABEL, ROW, VALUE } from "../rows";
import { Section } from "../settings-ui";
import type { SettingsFormProps } from "../types";

/** A pointer that hovers or aims finely means a keyboard is likely to hand; a bare touch screen has neither. */
const KEYBOARD = "(any-hover: hover), (any-pointer: fine)";
const hasKeyboard = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(KEYBOARD).matches;
function subscribeKeyboard(onChange: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(KEYBOARD);
  query.addEventListener?.("change", onChange);
  return () => query.removeEventListener?.("change", onChange);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "6 Oct 2026" from "2026-10-06". */
export function changelogDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[(m ?? 1) - 1]} ${y}`;
}

export function AboutSection(p: SettingsFormProps) {
  const commands = useCommandsOptional();
  const keyboard = useSyncExternalStore(subscribeKeyboard, hasKeyboard, () => false);
  return (
    <div className="flex flex-col gap-7">
      <Section title="About">
        <div className={ROW}>
          <span className={LABEL}>Version</span>
          <span className={VALUE}>{p.app?.version ?? "—"}</span>
        </div>
        {keyboard && commands && (
          <div className={ROW}>
            <span className="flex min-w-0 flex-col">
              <span className={LABEL}>Keyboard shortcuts</span>
              <span className={HINT}>Or press ? anywhere.</span>
            </span>
            <Button variant="secondary" onClick={commands.openShortcuts}>
              Show shortcuts
            </Button>
          </div>
        )}
        <Link href="/privacy" className={cx(ROW, "text-ink transition-colors dur-fast hover:bg-hover focus-visible:-outline-offset-2 active:bg-press last:rounded-b-xl")}>
          <span className="flex min-w-0 flex-col">
            <span className={LABEL}>Privacy</span>
            <span className={HINT}>Where your data lives, and what leaves this device</span>
          </span>
          <Icon name="chevron-right" size={16} className="shrink-0 text-ink-3" />
        </Link>
      </Section>

      <section aria-label="What’s new" className="flex flex-col gap-2">
        <SectionLabel>What’s new</SectionLabel>
        <ListCard as="div">
          {CHANGELOG.map((entry) => (
            <div key={entry.date} className={cx(ROW, "flex-col items-stretch gap-y-1 py-3")}>
              <h3 className="text-body-sm font-medium text-ink-2 num">{changelogDate(entry.date)}</h3>
              <ul className="flex list-disc flex-col gap-1 pl-5 text-body text-pretty text-ink">
                {entry.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </ListCard>
      </section>
    </div>
  );
}
