"use client";
// The pieces Lists are drawn with (DECISIONS.md, amendment 2026-10-22): the few glyphs only lists need (kept here, not
// in ui/icons, which every shell carries), an item's status ring and stars, the emoji picker and the list cards.
// Route-level only: the sidebar's own island draws its rows itself.
import Link from "next/link";
import type { SVGProps } from "react";
import { listCardLine, nextStatus, STATUS_LABEL, type ItemStatus, type ListCardRow } from "@/data/queries/lists";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/icons";
import { CARD } from "@/ui/list-card";
import { MENU_ITEM, MenuButton } from "@/ui/popover";

const PATHS = {
  star: "M10 2.8l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L2.8 8.1l5-.7z",
  link: "M8.5 11.5a3 3 0 0 0 4.2 0l2.6-2.6a3 3 0 0 0-4.2-4.2l-.9.9 M11.5 8.5a3 3 0 0 0-4.2 0l-2.6 2.6a3 3 0 0 0 4.2 4.2l.9-.9",
  shuffle: "M3 6h2.5c2 0 3.2 1 4.5 3.5S12.5 13.5 14.5 13.5H17 M15 11.5l2 2-2 2 M3 13.5h2.5c1.2 0 2.1-.4 2.9-1.2 M17 6h-2.5c-1.2 0-2.1.4-2.9 1.2 M15 4l2 2-2 2",
  note: "M5.5 3h6l3 3v10.5a.5.5 0 0 1-.5.5h-8.5a.5.5 0 0 1-.5-.5v-13A.5.5 0 0 1 5.5 3z M8 9.5h5M8 12.5h5",
  list: "M7 5.5h9M7 10h9M7 14.5h9 M3.8 5.5h.01M3.8 10h.01M3.8 14.5h.01",
} as const;

export type ListGlyphName = keyof typeof PATHS;

/** The lists' own glyphs, drawn like the shared set (20-unit grid, 1.6 px stroke, currentColor). */
export function ListGlyph({ name, size = 18, filled = false, className, ...rest }: { name: ListGlyphName; size?: number; filled?: boolean } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg
      viewBox="0 0 20 20"
      width={size}
      height={size}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/**
 * The item's status as a ring, in the look's own check shape (task-check): empty for to do, half for doing, filled
 * with a tick for done. A tap moves it on (to do → doing → done → to do); the button says where to.
 */
export function StatusRing({ status, title, onChange, size = "row" }: { status: ItemStatus; title: string; onChange: (next: ItemStatus) => void; size?: "row" | "sheet" }) {
  const next = nextStatus(status);
  return (
    <button
      type="button"
      onClick={() => onChange(next)}
      aria-label={`${title}: ${STATUS_LABEL[status]}. Mark ${STATUS_LABEL[next].toLowerCase()}`}
      data-status={status}
      className="relative z-1 flex size-11 shrink-0 items-center justify-center rounded-check hover:[&>span]:border-ink motion-safe:active:[&>span]:scale-90"
    >
      <span
        className={cx(
          "task-check flex items-center justify-center overflow-hidden transition-[background-color,border-color,transform] dur-fast",
          size === "row" ? "size-4.5" : "size-[22px]",
          status === "done" ? "border-ink bg-ink text-ink-inverse" : status === "doing" ? "border-ink" : "border-check",
        )}
        // Half full while doing: the lower half in ink, as a level rising.
        style={status === "doing" ? { background: "linear-gradient(to top, var(--ink) 50%, transparent 50%)" } : undefined}
      >
        {status === "done" && <Icon name="check" size={size === "row" ? 12 : 13} strokeWidth={2.2} />}
      </span>
    </button>
  );
}

/** Stars, read-only: as many as the rating, in the over colour so they read as a mark, not a control. */
export function Stars({ rating, size = 12 }: { rating: number | null; size?: number }) {
  if (!rating) return null;
  return (
    <span className="inline-flex items-center gap-px text-over" aria-label={`${rating} of 5 stars`} role="img">
      {Array.from({ length: rating }, (_, i) => (
        <ListGlyph key={i} name="star" size={size} filled strokeWidth={1} />
      ))}
    </span>
  );
}

/** Five stars to set a rating; the chosen one again takes it off. */
export function StarPicker({ rating, onChange }: { rating: number | null; onChange: (next: number | null) => void }) {
  return (
    <div role="radiogroup" aria-label="Rating" className="-ml-2.5 flex items-center">
      {[1, 2, 3, 4, 5].map((n) => {
        const on = (rating ?? 0) >= n;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} ${n === 1 ? "star" : "stars"}${rating === n ? ", tap again to clear" : ""}`}
            onClick={() => onChange(rating === n ? null : n)}
            className={cx("flex size-11 items-center justify-center rounded-control transition-colors dur-fast hover:bg-hover", on ? "text-over" : "text-ink-4")}
          >
            <ListGlyph name="star" size={22} filled={on} />
          </button>
        );
      })}
    </div>
  );
}

/** A small set to start from; any other is typed in. A list's emoji is the person's own label, not decoration. */
const EMOJI = ["🍥", "📚", "💡", "🎬", "📺", "🎮", "🎵", "🎧", "🍿", "🍜", "☕", "🍳", "🛒", "✈️", "🗺️", "🏠", "💼", "🎨", "📷", "🧠", "🧪", "🌱", "🏃", "❤️", "⭐", "🎯", "🔖", "🎁", "📝", "🧩"];

/** The emoji beside a list's name: a grid to pick from, a field for any other, and "No emoji". */
export function EmojiPicker({ emoji, name, onChange }: { emoji: string | null; name: string; onChange: (next: string | null) => void }) {
  return (
    <MenuButton
      label={emoji ? `Change the emoji of ${name}` : `Add an emoji to ${name}`}
      align="left"
      text={<span className="flex size-11 items-center justify-center text-[1.75rem] leading-none sm:size-12">{emoji ?? <ListGlyph name="list" size={22} className="text-ink-3" />}</span>}
      className="rounded-control hover:bg-hover"
    >
      {(close) => (
        <div className="flex w-64 flex-col gap-2 p-1">
          <div className="grid grid-cols-6 gap-0.5">
            {EMOJI.map((e) => (
              <button key={e} type="button" role="menuitem" aria-label={e} onClick={() => (onChange(e), close())} className="flex size-10 items-center justify-center rounded-sm text-xl hover:bg-hover">
                {e}
              </button>
            ))}
          </div>
          <form
            className="flex items-center gap-2 px-1"
            onSubmit={(ev) => {
              ev.preventDefault();
              const v = String(new FormData(ev.currentTarget).get("emoji") ?? "").trim();
              if (v) onChange(Array.from(v).slice(0, 2).join(""));
              close();
            }}
          >
            <input name="emoji" aria-label="Any emoji" placeholder="Or type one" className="h-10 min-w-0 flex-1 rounded-sm border border-line-control bg-surface px-2 text-base text-ink outline-none focus:border-ink" />
          </form>
          {emoji && (
            <button type="button" role="menuitem" className={MENU_ITEM} onClick={() => (onChange(null), close())}>
              No emoji
            </button>
          )}
        </div>
      )}
    </MenuButton>
  );
}

/** The list cards: a list's own lists, or the top level on the Lists page. */
export function ListCards({ lists }: { lists: readonly ListCardRow[] }) {
  if (lists.length === 0) return null;
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {lists.map((l) => (
        <li key={l.id}>
          <Link
            href={`/list/${l.id}`}
            data-list-card={l.id}
            className={cx(CARD, "flex min-h-16 items-center gap-3 p-4 transition-colors dur-fast hover:border-line-strong active:bg-press")}
          >
            <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center text-2xl leading-none">
              {l.emoji ?? <ListGlyph name="list" size={20} className="text-ink-3" />}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-body-lg font-medium text-ink">{l.name ?? "Untitled list"}</span>
              <span className="text-body-sm text-ink-2 num">{listCardLine(l)}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
