// The icon set (DESIGN_SYSTEM.md §6): inline SVG on a 20-unit grid, 1.6 px
// stroke, round caps and joins, currentColor. No emoji anywhere in the UI.
import type { SVGProps } from "react";

export type IconName =
  | "inbox"
  | "sun"
  | "calendar"
  | "moon"
  | "book"
  | "routines"
  | "grid"
  | "search"
  | "plus"
  | "check"
  | "chevron-down"
  | "chevron-right"
  | "clock"
  | "flag"
  | "grip"
  | "carry"
  | "cloud-check"
  | "cloud-off"
  | "sliders"
  | "lock"
  | "close"
  | "alert"
  | "menu"
  | "more"
  | "arrow-up"
  | "arrow-down"
  | "arrow-left"
  | "arrow-right"
  | "calendar-week";

const PATHS: Record<IconName, string> = {
  inbox: "M3 11.5V15a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 17 15v-3.5 M3 11.5l2-6.5h10l2 6.5 M3 11.5h4l1.2 2h3.6l1.2-2h4",
  sun: "M10 6.8a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4z M10 3v1.6M10 15.4V17M3 10h1.6M15.4 10H17M5.05 5.05l1.13 1.13M13.82 13.82l1.13 1.13M5.05 14.95l1.13-1.13M13.82 6.18l1.13-1.13",
  calendar: "M5.5 4.5h9a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z M3.5 8.5h13M7 3v3M13 3v3",
  moon: "M15.5 12.2A6 6 0 0 1 7.8 4.5a6 6 0 1 0 7.7 7.7z",
  book: "M4 4.5A1.5 1.5 0 0 1 5.5 3H16v13H5.5A1.5 1.5 0 0 0 4 17.5z M4 17.5V4.5M8 7h5",
  routines: "M4 10a6 6 0 0 1 10.2-4.2L16 7.5 M16 3.5v4h-4 M16 10a6 6 0 0 1-10.2 4.2L4 12.5 M4 16.5v-4h4",
  grid: "M4.5 3h3A1.5 1.5 0 0 1 9 4.5v3A1.5 1.5 0 0 1 7.5 9h-3A1.5 1.5 0 0 1 3 7.5v-3A1.5 1.5 0 0 1 4.5 3z M12.5 3h3A1.5 1.5 0 0 1 17 4.5v3A1.5 1.5 0 0 1 15.5 9h-3A1.5 1.5 0 0 1 11 7.5v-3A1.5 1.5 0 0 1 12.5 3z M4.5 11h3A1.5 1.5 0 0 1 9 12.5v3A1.5 1.5 0 0 1 7.5 17h-3A1.5 1.5 0 0 1 3 15.5v-3A1.5 1.5 0 0 1 4.5 11z M12.5 11h3a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5h-3a1.5 1.5 0 0 1-1.5-1.5v-3a1.5 1.5 0 0 1 1.5-1.5z",
  search: "M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11z M13 13l4 4",
  plus: "M10 4v12M4 10h12",
  check: "M4 10.5l4 4 8-9",
  "chevron-down": "M5 8l5 5 5-5",
  "chevron-right": "M8 5l5 5-5 5",
  clock: "M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M10 6v4l2.5 1.5",
  flag: "M5 17V3.5h9l-1.5 3.5 1.5 3.5H5",
  grip: "M7.5 5.5h.01M12.5 5.5h.01M7.5 10h.01M12.5 10h.01M7.5 14.5h.01M12.5 14.5h.01",
  carry: "M4 6h8a4 4 0 0 1 0 8H9 M11 11l-2 3 2 3",
  "cloud-check": "M6 15.5h8.5a3.5 3.5 0 0 0 .5-6.96A5 5 0 0 0 5.3 9.1 3.2 3.2 0 0 0 6 15.5z M8 12l1.6 1.6L13 10.2",
  "cloud-off": "M6 15.5h8.5a3.5 3.5 0 0 0 .5-6.96A5 5 0 0 0 5.3 9.1 3.2 3.2 0 0 0 6 15.5z M4 4l12 12",
  sliders: "M4 6h12M4 10h12M4 14h12 M8 4.4a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2z M13 8.4a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2z M7 12.4a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2z",
  lock: "M5.5 9h9a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1z M7 9V6.5a3 3 0 0 1 6 0V9",
  close: "M5 5l10 10M15 5L5 15",
  alert: "M10 3.5l7 12.5H3z M10 8.5v3.5M10 14v.01",
  menu: "M4 6h12M4 10h12M4 14h12",
  // Three dots: the caps do the drawing, so pass a heavier strokeWidth where it must read at 16 px.
  more: "M5 10h.01M10 10h.01M15 10h.01",
  "arrow-up": "M10 16V4M5.5 8.5 10 4l4.5 4.5",
  "arrow-down": "M10 4v12M5.5 11.5 10 16l4.5-4.5",
  "arrow-left": "M16 10H4M8.5 5.5 4 10l4.5 4.5",
  "arrow-right": "M4 10h12M11.5 5.5 16 10l-4.5 4.5",
  "calendar-week": "M5.5 4.5h9a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z M3.5 8.5h13M7 3v3M13 3v3 M6.5 12h2M9 12h2M11.5 12h2",
};

export function Icon({ name, size = 18, className, ...rest }: { name: IconName; size?: number } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg
      viewBox="0 0 20 20"
      width={size}
      height={size}
      fill="none"
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

