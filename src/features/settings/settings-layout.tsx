"use client";
// Settings' frame (SCREENS.md §18 Responsive; M1 gap rulings): from 900 px a
// section list on the left with the open section on the right; below it the
// list is one screen with a one-line summary per section, and a section
// pushes in with Back in the header, browser Back returning to the list. The
// open section lives in the URL's hash, so /settings#calendar and
// /settings#data land on their section on every band.
import { useEffect, useRef, useSyncExternalStore, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { ViewHeader } from "@/features/shell/view-header";
import { buttonClass } from "@/ui/button";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/icons";
import { parseSection, sectionTitle, type SectionKey } from "./sections";

/** From here up Settings is two columns (DESIGN_SYSTEM.md §4a medium band). */
const TWO_COLUMNS = "(min-width: 900px)";
const twoColumns = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(TWO_COLUMNS).matches;

// The open section is the URL's hash: a store over it, so a push, Back and a typed hash all redraw.
const listeners = new Set<() => void>();
function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("hashchange", onChange);
  window.addEventListener("popstate", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("hashchange", onChange);
    window.removeEventListener("popstate", onChange);
  };
}
const readSection = () => parseSection(window.location.hash);

export function useSettingsSection(): SectionKey | null {
  return useSyncExternalStore(subscribe, readSection, () => null);
}

function subscribeWidth(onChange: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(TWO_COLUMNS);
  query.addEventListener?.("change", onChange);
  return () => query.removeEventListener?.("change", onChange);
}

/** Whether Settings is in two columns now, so the section shown beside the list can be marked as the current one. */
function useTwoColumns(): boolean {
  return useSyncExternalStore(subscribeWidth, twoColumns, () => false);
}

/**
 * Opens a section. On the phone it is a new history entry, so Back returns to the list; in two columns the list
 * stays on screen and the choice replaces the entry instead of piling up.
 */
export function openSection(key: SectionKey): void {
  if (readSection() === key) return;
  if (twoColumns()) window.history.replaceState(window.history.state, "", `#${key}`);
  else window.history.pushState({ settingsFromList: true }, "", `#${key}`);
  listeners.forEach((l) => l());
}

/** The header's Back: the list it came from, or the list itself when the section was opened by a link. */
export function backToList(): void {
  if ((window.history.state as { settingsFromList?: boolean } | null)?.settingsFromList) {
    window.history.back();
    return;
  }
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  listeners.forEach((l) => l());
}

export interface SectionItem {
  key: SectionKey;
  title: string;
  summary: string;
}

export function SettingsLayout({
  items,
  active,
  render,
}: {
  items: readonly SectionItem[];
  /** null = the list on the phone; two columns then show the first section. */
  active: SectionKey | null;
  /** The section's controls. */
  render: (key: SectionKey) => ReactNode;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const shown = active ?? items[0]?.key ?? "account";
  // On the phone the list alone is on screen until a section is open, so nothing in it is current.
  const wide = useTwoColumns();
  const current = active ?? (wide ? shown : null);
  const previous = useRef<SectionKey | null>(active);

  // A section pushed in on the phone takes focus at its heading, from the top; Back puts focus on the row it came from.
  useEffect(() => {
    const was = previous.current;
    previous.current = active;
    if (was === active) return;
    if (twoColumns()) {
      if ((topRef.current?.getBoundingClientRect().top ?? 0) < 0) topRef.current?.scrollIntoView({ block: "start" });
      return;
    }
    if (active) {
      window.scrollTo(0, 0);
      headingRef.current?.focus({ preventScroll: true });
    } else if (was) {
      listRef.current?.querySelector<HTMLAnchorElement>(`a[data-section="${was}"]`)?.focus();
    }
  }, [active]);

  const onOpen = (e: MouseEvent<HTMLAnchorElement>, key: SectionKey) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    openSection(key);
  };
  // Up and down move along the list, Home and End jump to its ends; Enter opens the focused section.
  const onKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    const links = [...(listRef.current?.querySelectorAll<HTMLAnchorElement>("a[data-section]") ?? [])];
    const at = links.indexOf(document.activeElement as HTMLAnchorElement);
    if (at < 0) return;
    const to = e.key === "ArrowDown" ? at + 1 : e.key === "ArrowUp" ? at - 1 : e.key === "Home" ? 0 : e.key === "End" ? links.length - 1 : null;
    if (to === null) return;
    e.preventDefault();
    links[Math.max(0, Math.min(links.length - 1, to))]?.focus();
  };

  return (
    <>
      <div ref={topRef} className={cx(active && "max-md:hidden")}>
        <ViewHeader eyebrow="Settings" title="Your day" subtitle="Every change saves as you make it." />
      </div>
      {active && (
        <header className="flex flex-col items-start gap-1 md:hidden">
          <button type="button" onClick={backToList} className={cx(buttonClass({ variant: "link", size: "compact" }), "-ml-2 text-ink-2")}>
            <Icon name="arrow-left" size={16} /> Settings
          </button>
          <h1 ref={headingRef} tabIndex={-1} className="font-display text-title font-book text-balance text-ink focus:outline-none">
            {sectionTitle(active)}
          </h1>
        </header>
      )}
      <div className="flex flex-col gap-6 md:grid md:grid-cols-[11rem_minmax(0,1fr)] md:items-start md:gap-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-8">
        <nav aria-label="Settings sections" className={cx(active && "max-md:hidden", "md:sticky md:top-0")}>
          <ul ref={listRef} onKeyDown={onKeyDown} className="rounded-xl border border-line bg-surface md:flex md:flex-col md:gap-0.5 md:rounded-none md:border-0 md:bg-transparent">
            {items.map((item) => (
              <li key={item.key} className="border-t border-line first:border-t-0 md:border-t-0">
                <a
                  href={`#${item.key}`}
                  data-section={item.key}
                  aria-current={item.key === current ? "page" : undefined}
                  onClick={(e) => onOpen(e, item.key)}
                  className="flex min-h-14 items-center gap-3 px-4 py-2 text-ink transition-colors dur-fast hover:bg-hover focus-visible:-outline-offset-2 active:bg-press max-md:first:rounded-t-xl max-md:last:rounded-b-xl md:min-h-9 md:rounded-lg md:px-3 md:py-1.5 md:aria-[current=page]:bg-surface md:aria-[current=page]:shadow-nav"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-body-lg md:text-body md:font-medium">{item.title}</span>
                    <span className="truncate text-body-sm text-ink-2 md:hidden">{item.summary}</span>
                  </span>
                  <Icon name="chevron-right" size={16} className="shrink-0 text-ink-3 md:hidden" />
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className={cx("min-w-0", !active && "max-md:hidden")}>{render(shown)}</div>
      </div>
    </>
  );
}
