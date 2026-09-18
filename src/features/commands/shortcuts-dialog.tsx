"use client";
// The `?` overlay (SCREENS.md §24): every shortcut, grouped as the spec
// groups them, on the shared dialog surface. Two keys for one action share
// a row (J and the down arrow both select the next task). Hidden on touch
// by the global kbd rule, the keys mean nothing there anyway.
import { useEffect } from "react";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/icons";
import { Kbd } from "@/ui/kbd";
import { EYEBROW } from "@/ui/section-label";
import { Sheet } from "@/ui/sheet";
import { displayShortcut } from "./keys";
import { COMMANDS, GROUP_ORDER, type Command } from "./registry";

interface KeyRow {
  title: string;
  keys: string[];
}

/** One row per action: the same title in a group lists all of its keys together. */
function keyRows(commands: readonly Command[], isMac: boolean): KeyRow[] {
  const rows: KeyRow[] = [];
  for (const c of commands) {
    if (!c.shortcut) continue;
    const key = displayShortcut(c.shortcut, isMac);
    const row = rows.find((r) => r.title === c.title);
    if (row) row.keys.push(key);
    else rows.push({ title: c.title, keys: [key] });
  }
  return rows;
}

export function ShortcutsDialog({ isMac, onClose }: { isMac: boolean; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  const groups = GROUP_ORDER.map((g) => ({
    group: g,
    rows: keyRows(
      COMMANDS.filter((c) => c.group === g),
      isMac,
    ),
  })).filter((g) => g.rows.length > 0);
  return (
    <Sheet label="Keyboard shortcuts" onClose={onClose} width="lg" className="max-h-[85dvh] sm:pt-[8vh]">
      <div className="flex shrink-0 items-center justify-between gap-3 px-5 pt-3 pb-2 sm:pt-4">
        <h2 className="font-display text-pane font-medium text-ink">Keyboard shortcuts</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-lg text-ink-2 transition-colors dur-fast hover:bg-hover hover:text-ink sm:size-9">
          <Icon name="close" size={18} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
        {/* Every kbd hides on a touch device, which would leave a bare list of names; say why instead. */}
        <p className="hidden text-body text-ink-2 [@media(hover:none)]:block">These need a keyboard. On a phone, each row keeps its actions behind More actions.</p>
        {/* Two columns from `sm` up; each group stays whole so the long "Selected task" list heads the first column and the rest fill the second. */}
        <div className="sm:columns-2 sm:gap-8 [@media(hover:none)]:hidden">
          {groups.map((g) => (
            <section key={g.group} className="mb-5 break-inside-avoid">
              <h3 className={cx(EYEBROW, "mb-1")}>{g.group}</h3>
              <dl>
                {g.rows.map((r) => (
                  <div key={r.title} className="flex min-h-8 items-center justify-between gap-3 text-body">
                    <dt className="text-ink">{r.title}</dt>
                    <dd className="flex shrink-0 items-center gap-1">
                      {r.keys.map((k) => (
                        <Kbd key={k}>{k}</Kbd>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
        <p className="text-body-sm text-ink-3 [@media(hover:none)]:hidden">
          Any other letter opens quick-add and types itself. <Kbd>T</Kbd> with nothing selected jumps to today.
        </p>
      </div>
    </Sheet>
  );
}
