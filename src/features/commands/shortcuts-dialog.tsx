"use client";
// The `?` overlay (SCREENS.md §24): every shortcut, searchable, grouped exactly as the spec groups them, on the
// shared dialog surface. The rows come from the registry and one table of keys that are no command (key-rows.ts),
// so they cannot drift from what the keys do. On a touch device the key table waits for a hardware keyboard's
// first keypress (`keyless:`); until then a sentence says why.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/ui/button";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/icons";
import { Kbd } from "@/ui/kbd";
import { EYEBROW } from "@/ui/section-label";
import { Sheet } from "@/ui/sheet";
import { filterSections, keySections } from "./key-rows";

/** A touch device that has not seen a hardware keypress: a field focused there would raise the on-screen keyboard. */
const keyless = () => typeof window.matchMedia === "function" && window.matchMedia("(hover: none)").matches && !("keys" in document.documentElement.dataset);

export function ShortcutsDialog({ isMac, onClose }: { isMac: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const queryRef = useRef(query);
  const fieldRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  useEffect(() => {
    queryRef.current = query;
  });
  useEffect(() => {
    if (!keyless()) fieldRef.current?.focus();
    // Esc unwinds one layer (SCREENS.md §1 rule 3): the search first, then the overlay.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (queryRef.current) setQuery("");
      else onClose();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  const all = useMemo(() => keySections(isMac), [isMac]);
  const sections = useMemo(() => filterSections(all, query), [all, query]);
  return (
    // A long list scrolls inside the dialog rather than running off the screen (ruling R6); from `sm`
    // the cap leaves room below, since the dialog already starts 8vh down.
    <Sheet label="Keyboard shortcuts" onClose={onClose} width="lg" className="max-h-[calc(100dvh-5rem)] sm:max-h-[80dvh]">
      <div className="flex shrink-0 items-center justify-between gap-3 px-5 pt-3 pb-2 sm:pt-4">
        <h2 className="font-display text-pane font-medium text-ink">Keyboard shortcuts</h2>
        <Button variant="icon" onClick={onClose} aria-label="Close" className="-mr-2">
          <Icon name="close" size={18} />
        </Button>
      </div>
      {/* The search box has no border of its own: the row's hairline turns ink while it has focus (as the palette's). */}
      <div className="mx-5 mb-2 flex shrink-0 items-center gap-2 border-b border-line transition-colors dur-fast has-[input:focus]:border-ink keyless:hidden">
        <Icon name="search" size={16} className="shrink-0 text-ink-3" />
        <input
          ref={fieldRef}
          type="search"
          aria-label="Search shortcuts"
          aria-controls={listId}
          placeholder="Search by action or key…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          className="h-11 min-w-0 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-ink-4 focus-visible:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
      </div>
      {/* Focusable, so the arrow keys scroll a list that has nothing else to focus (axe scrollable-region-focusable). */}
      <div id={listId} role="region" aria-label="All shortcuts" tabIndex={0} className="min-h-0 flex-1 overflow-y-auto px-5 pt-2 pb-5 focus-visible:-outline-offset-2">
        {/* Every kbd hides on a touch device without a keyboard, which would leave a bare list of names; say why instead. */}
        <p className="hidden text-body text-pretty text-ink-2 keyless:block">These need a keyboard. On a phone, each row keeps its actions behind More actions.</p>
        <div className="keyless:hidden">
          {sections.length === 0 && (
            <p role="status" className="py-6 text-body text-ink-3">
              No shortcut matches “{query.trim()}”.
            </p>
          )}
          {/* Two columns from `sm` up; each group stays whole so the long ones head a column and the rest fill in. */}
          <div className="sm:columns-2 sm:gap-8">
            {sections.map((s) => (
              <section key={s.group} aria-label={s.label} className="mb-5 break-inside-avoid">
                <h3 className={cx(EYEBROW, "mb-1")}>{s.label}</h3>
                <dl>
                  {s.rows.map((r) => (
                    <div key={r.title} className="flex min-h-8 items-center justify-between gap-3 py-0.5 text-body">
                      <dt className="min-w-0 text-ink">
                        {r.title}
                        {r.note && <span className="block text-body-sm text-pretty text-ink-3">{r.note}</span>}
                      </dt>
                      <dd className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                        {r.keys.map((k) => (
                          <Kbd key={k}>{k}</Kbd>
                        ))}
                        {r.words && <span className="text-body-sm text-ink-3">{r.words}</span>}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        </div>
      </div>
    </Sheet>
  );
}
