// The settings row vocabulary (DESIGN_SYSTEM.md §4a "Settings: grouped
// list"), shared by the form and the calendar panel it embeds. A row is
// 52 px with the label left and its control right; a control that does not
// fit beside the label wraps under it, which is the phone layout.
export const ROW = "flex min-h-13 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line px-4 py-2 first:border-t-0";
export const LABEL = "text-body font-medium text-ink";
/** The second line under a label. */
export const HINT = "text-body-sm text-pretty text-ink-2";
/** A caption that explains a group. */
export const NOTE = "text-body-sm text-pretty text-ink-3";
/** A value shown beside a label: the email, the version, "Off". */
export const VALUE = "text-body text-ink-2 num";
/** A text action inside a row ("None"): 44 px on the phone, 28 above. */
export const ROW_ACTION = "flex h-11 shrink-0 items-center rounded-sm px-2 text-body-sm font-medium text-ink-2 transition-[background-color,color] dur-fast hover:bg-hover hover:text-ink sm:h-7";
