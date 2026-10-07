// The morning plan's one word on Today's header and ritual row (SCREENS.md §2.1): "Planned at 8:42". Its own module,
// so the Today shell carries this line and not the plan's easiest move, which only the over day's island reads
// (SYSTEM_DESIGN.md §11.6: Turbopack keeps a module whole).

/** "Planned at 8:42" for the Today header. */
export function plannedLabel(time: string): string {
  return `Planned at ${time}`;
}
