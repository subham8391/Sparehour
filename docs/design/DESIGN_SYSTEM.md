# Sparehour design system — "Daylight"

The working day as a strip of light. Everything on screen serves one number: how much time you actually have to spare. Calm by default, precise when you look closely, never a wall of red.

Mockups live in `docs/design/mockups/` (`*.dc.html`, one per screen) and are published as the "Sparehour Daylight" canvas. This document is the source of truth for tokens and rules; the mockups are the reference for how they combine.

## 1. Principles

1. **Green means spare time, and nothing else.** The accent is reserved for the hero number, the spare segment of the ribbon and "done by". Buttons, links in the app shell, selection and focus use ink, not green, so the eye learns that green = room to breathe.
2. **Colour is semantic, so it is rare.** Blue = other people's time (calendar events). Dark ink = time you chose (blocks). Amber = gently over, or the evening. Ember = a real deadline only. Nothing else gets a colour.
3. **Never make the user feel behind.** No red counts, no badges of shame, no "overdue" language. A missed day carries over quietly; an over-planned day gets amber and a sentence, not an alarm.
4. **Instrument, not dashboard.** One hero figure, one ribbon, then lists. Tick marks, hairlines and tabular numbers instead of stat tiles and charts.
5. **Type carries the identity.** The serif does the emotional work at large sizes; the sans stays quiet at UI sizes; the mono makes every time and duration line up.
6. **Keyboard-first, touch-friendly.** Every action has a key; every mobile target is at least 44 px.
7. **Motion is feedback, not decoration.** A check-off settles, a block snaps into a slot, a ribbon animates when spare time changes. Nothing moves on load. Respect `prefers-reduced-motion`.

## 2. Colour tokens

Derived in OKLCH so both themes share the same chroma and lightness logic: every neutral carries a faint green bias (hue 165) so the greys read as chosen, not defaulted. Accents share hue families — green 165, blue 262, amber 70, ember 30.

| Token | Role | Light | Dark |
|---|---|---|---|
| `paper` | Page ground | `#F4F8F6` | `#0C110F` |
| `surface` | Cards, timeline pane, inputs | `#FFFFFF` | `#151917` |
| `surface-2` | Sidebar, chips, sunken areas, ribbon track when "fits exactly" | `#EDF1EF` | `#1E2320` |
| `line` | Hairlines, dividers | `#D9E0DD` | `#292F2C` |
| `line-strong` | Checkbox rings, button borders, drag handles | `#BEC6C2` | `#3E4441` |
| `ink` | Primary text, primary buttons, planned blocks, the now-line | `#161C19` | `#E8ECEA` |
| `ink-2` | Secondary text (project names, summaries) | `#5C6661` | `#9EA7A3` |
| `ink-3` | Tertiary text (labels, hour ticks). Decorative only — never the sole carrier of essential information | `#66706C` | `#8A948F` |
| `spare` (accent) | Spare-time text, "done by", the logo arc — nothing else | `#1A7455` | `#69D6AA` |
| `spare-fill` | Ribbon dots / progress, focus ring | `#249C74` | `#37B78A` |
| `spare-soft` | Ribbon track, "planned" status chip | `#D7F3E5` | `#103627` |
| `meet` | Calendar-event text | `#4868A2` | `#9EBEF8` |
| `meet-fill` | Calendar segments, event left border | `#6586C3` | `#7698D6` |
| `meet-soft` | Calendar event background, `#project` token | `#E0ECFF` | `#202E47` |
| `over` (amber) | Over-capacity text, evening label, gentle-ask actions | `#8F6329` | `#EBB16C` |
| `over-fill` | Over-capacity tail on bars | `#EBB16C` | `#EBB16C` |
| `over-soft` | Gentle-ask panel, "easiest move" card | `#FEEBD6` | `#3E290F` |
| `deadline` (ember) | Deadline chip text — the only warm-red in the product | `#A8493D` | `#F58D7C` |
| `deadline-soft` | Deadline chip background | `#FFE3DE` | `#47211B` |

Measured contrast (light / dark), text on `surface`: ink 17.4 / 15.6 · ink-2 6.0 / 7.2 · ink-3 5.1 / 5.7 · spare 5.7 / 10.0 · meet 5.6 / 9.4 · over 5.3 / 9.3 · deadline 5.7 / 8.1; on their own soft tints: spare 4.9, meet 4.7, over 4.5, deadline 4.7 (dark ≥ 6). Every text token clears WCAG AA (4.5:1) on every background it is used on, `ink-3` included — the end-to-end suite runs axe's colour-contrast check on the real pages, so a token that slips below AA fails CI. (Tightened 2026-09-14: `ink-3`, `spare`, `over` and `deadline` were darkened a step in the light theme; the earlier `ink-3` sat at 3.0.)

**Never:** pure `#000`/`#fff` text, a red anywhere except the deadline chip, gradients on controls. The only gradient in the product is the daylight tint behind the day timeline: `linear-gradient(180deg, rgba(101,134,195,0.07) 0%, transparent 42%, rgba(160,111,48,0.08) 100%)` — cool at 9:00, warm at 18:00, at most 8% opacity.

### Theme mechanics
Tokens are CSS custom properties on `:root` (light). `@media (prefers-color-scheme: dark)` redefines them under `:root:not([data-theme="light"])`; `:root[data-theme="dark"]` redefines them again so an explicit choice wins in both directions. Components only ever reference tokens. `body` sets `background: var(--paper)` explicitly.

## 3. Typography

| Role | Face | Fallback stack | Use |
|---|---|---|---|
| Display | **Instrument Serif** (regular, italic) | Iowan Old Style, Georgia, serif | The spare-time number, screen titles, day numbers, onboarding headline. Italic for the one emotional word ("spare", "over") |
| UI | **Instrument Sans** 400 / 500 / 600 | Helvetica Neue, Helvetica, Arial, sans-serif | Everything else |
| Data | **DM Mono** 400 / 500 | SF Mono, Menlo, Consolas, monospace | Times, durations, counts, hour ticks, quick-add tokens, keyboard hints |

Loaded from Google Fonts with `display=swap`; the fallbacks were chosen for close metrics because exported PNG/PDF use them.

### Scale (px / line-height)
| Step | Size | Where |
|---|---|---|
| Hero | 52–68 / 1.0 serif | Spare-time number (52 on Today, 68 in onboarding, 42 on mobile) |
| Hero-em | 34 italic serif | "spare" / "over" beside the hero |
| Title | 30 / 1.1 serif | Screen title ("Tuesday, 15 September") |
| Pane title | 20 serif | Right-pane and card titles |
| Row | 15 / 1.45 sans | Task titles |
| Body | 14 / 1.45 sans | Default UI text |
| Meta | 13 sans | Project names, quick actions |
| Chip | 12 mono | Durations, times |
| Label | 11.5 sans 600, tracking 0.08em, uppercase | Section labels ("CARRIED OVER") |
| Tick | 11 mono | Hour labels, sync status |

Rules: `text-wrap: balance` on titles, `text-wrap: pretty` on paragraphs; `font-variant-numeric: tabular-nums` wherever digits align; body copy never wider than ~65 characters; letter-spacing −0.01em on the serif.

## 4. Spacing, shape, elevation

- **Spacing scale:** 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 28, 36, 40, 44. Siblings are laid out with flex/grid `gap`, never stacked margins.
- **Radii:** 5 (kbd), 6 (chips, ribbon segments), 8 (buttons, nav items, list rows on hover), 12 (list cards), 14 (ribbon card, mobile cards), 18 (mobile FAB), 20 (mobile sheet top), 999 (pills).
- **Borders:** 1 px `line` on cards and inputs; 1.5 px `line-strong` on checkbox rings; 3 px left border on timeline events (meet-fill or ink).
- **Elevation:** almost none. Cards: `0 1px 2px rgba(22,28,25,0.04)`. Active nav item: `0 1px 2px rgba(22,28,25,0.06), 0 0 0 1px line`. Only two things float: the mobile FAB (`0 8px 20px rgba(22,28,25,0.22)`) and the quick-add sheet (`0 -12px 40px rgba(22,28,25,0.18)`).
- **Layout (desktop 1440):** sidebar 236 · main pane fluid (min 640) · day pane 380. Main pane padding 28/40. Below 1180 px the day pane collapses to a toggle; below 900 px the sidebar becomes a 56 px icon rail (as on the week planner).
- **Layout (mobile 390):** 20 px gutters, 54 px reserved at the top for the system status bar (never drawn), tab bar 88 px including the home-indicator area.

## 4a. Responsive layout — every screen works on a phone

Mobile-first CSS: the phone layout is the base, wider layouts are added with `min-width` queries. One data model, one token set, one layout per width band. Nothing is "desktop only".

| Band | Width | App shell | What changes |
|---|---|---|---|
| Phone | < 640 px | Bottom tab bar (Today · Inbox · Week · Browse — Browse holds areas, projects, Someday, Logbook, carried-over and Settings), FAB for quick add, sheets instead of side panes | Single column. Today's day timeline becomes a "Day" tab on the ribbon card. Hover actions become swipe (row) or long-press (menu). Drag-to-block becomes tap-to-schedule. |
| Narrow | 640–899 px | 56 px icon rail | Single pane. Day timeline opens as a right-side sheet. Week planner shows 3 days with a horizontal scroll. |
| Medium | 900–1179 px | Full sidebar (collapsible) | Two panes: main + day timeline toggled from the header. Week planner shows 5 days; weekends fold into one column. |
| Wide | ≥ 1180 px | Full sidebar | Three panes on Today (sidebar · main · day timeline). Week planner shows all 7 days. |

Per-screen adaptation on the phone:

| Screen | Phone behaviour |
|---|---|
| Today | Hero + ribbon card, then Carried over, Today, This Evening (collapsed by default). On Today rows swipe right = done, swipe left = move (Tomorrow / Someday); on Carried-over rows swipe right = Today / Tomorrow, swipe left = Someday / Drop. A List · Day toggle on the ribbon card shows the vertical timeline; a task's time is set by tapping it, then a slot. |
| Quick add | Bottom sheet docked above the keyboard, tokens parsed live, one row of suggestion chips (36 px). |
| Upcoming (week) | Day strip with 7 mini capacity bars → tap a day to scroll to it; days are stacked vertically as an agenda; "Not yet planned" is a tappable strip that opens a picker (choose a day) instead of drag. |
| Morning plan | One column: sticky capacity summary, then the Easiest-move card, then the groups; step buttons fixed at the bottom (48 px). |
| Evening shutdown | One scrolling screen (same order on desktop): done today → carried to tomorrow → day rating (five 44 px targets) → one highlight (text) → tomorrow's first draft → "Close the day". |
| Onboarding | One step per screen, the reveal keeps the hero + ribbon + equation, buttons full-width. |
| Inbox | Tap a row to reveal a four-button triage bar (Today · Tomorrow · Someday · Project…); swipe right = Today, left = Someday; "Select" for bulk. |
| Projects, Someday, Logbook | Reached from Browse. Same list rows; day chips ("Today", "Thu", "Carried ×2") instead of times; bulk select via long-press; filters in a sheet. |
| Sign-in and onboarding steps | One decision per screen; toggles and radios at 44 px; the primary button fixed at the bottom above the safe area. |
| Task detail | Full-screen sheet with the fields in the same order as the desktop panel. |
| Command palette | Opens as a sheet from the search icon; keyboard shortcuts are hidden on touch devices (no `kbd` hints). |
| Settings | Grouped list; working hours as a per-day picker. |

Touch rules: every target ≥ 44 × 44 px; every hover-only action has a tap or long-press equivalent; every drag has a tap path; horizontal scrolling only inside containers that show a scroll affordance (the day strip, the 3-day week); text never depends on hover to be readable. Safe areas: `env(safe-area-inset-*)` on the tab bar and sheets; 54 px reserved at the top for the system status bar, which is never drawn.

## 5. Components

### Spare-time ribbon (the hero)
A horizontal track spanning working hours. Track = `spare-soft` with a 6 px dot grid in `spare-fill` at 35% (so spare time visibly "breathes"). Segments: calendar events `meet-fill`; planned blocks `ink` at 86%; the elapsed part of the day is `surface-2` with a 135° hatch. A 2 px `ink` line marks now; a 1.5 px dashed `spare` line marks the projected finish. Hour ticks underneath in `ink-3` mono.
States: **spare** (green track, hero in ink + "spare" in green italic) · **fits exactly** (track `surface-2`, hero "0m spare" in ink-2) · **over** (track `surface-2`, an `over-fill` tail extends past the end, hero in `over` with "over" italic, one sentence of copy and one suggested move). Heights: 26 px on Today, 44 px in onboarding, 16 px on mobile, 6 px as the per-day capacity bar on the week planner.

### Task row
44 px min-height (52 on mobile), 12 px gap. Anatomy left→right: check ring · title (15 px, single line, ellipsis) · deadline chip (only if a deadline exists) · time chip (if blocked) · estimate chip · project name (`ink-2`) · trailing control (drag grip, carry count, or quick actions). Hover: `paper` background and the quick actions appear. Checked: ring fills `ink`, title strikes through in `ink-3`, row fades over 160 ms then moves to the Logbook.
Estimate chip variants: solid `surface-2` mono for a real estimate; dashed `line-strong` border for the default 30 m ("30m?") so an unestimated task is visible without being loud.

### Carried-over row and the gentle ask
Same as a task row plus a carry count (`×2`, mono, `ink-3`) and quick actions `Today · Tomorrow · Someday · Drop`. After the third carry an inline panel appears under the row in `over-soft`: "Carried over three times — still want this?" with `Keep today · Someday · Break it down · Drop` in `over`. "Keep today" is first because a no-penalty yes must exist; the panel is dismissible and never blocks the list.

### Timeline (day pane)
68 px per hour, hour lines `line`, half-hour lines `#E5EAE7` (dark `#232A26`), gutter labels mono 11 in `ink-3`. Events: 6 px radius, 3 px left border, 12.5 px text, mono time on the right or a second line when the event is taller than 40 px. Meetings use `meet-soft` / `meet-fill` / `meet`; blocks use `surface-2` / `ink`. Past events at 55% opacity. Now-line: 1.5 px `ink` with a 9 px dot in the gutter and the current time in mono 500. Projected finish: 1.5 px dashed `spare` with a `spare-soft` pill "done by 4:30pm". Dragging a task over the timeline shows a dashed `line-strong` slot snapped to 5 minutes with its start time; dropping creates a block and writes it to the chosen calendar.

### Buttons
Primary: `ink` background, `paper` text, 36 px (44 in onboarding and on mobile), radius 8–10, 500 weight. Secondary: `surface` with 1 px `line-strong` border. Text button: `ink-2`, becomes `ink` on hover. No green buttons, ever. Focus ring: 2 px `spare-fill` at 2 px offset.

### Chips and tokens
Chip: 22 px, radius 6, `surface-2` / `ink-2`. Deadline chip: `deadline-soft` / `deadline` with a flag icon. Status chips ("Planned at 9:12 · 2 min", "Synced · works offline") stay neutral — `surface-2` / `ink-2` with a check icon — so green keeps its one meaning. Quick-add tokens (26 px, radius 7): date `spare-soft`, estimate `surface-2` mono, project `meet-soft` / `meet`, tag `surface-2`.

### Keyboard hints
`kbd`: 20 px, mono 11, `surface` with a 1 px `line` border and a 2 px bottom border. Shown beside "Add a task" (Q), in the search field (⌘K) and in the command palette.

### Navigation
Sidebar items 34 px, radius 8, `ink-2`; active = `surface` background with the 1 px ring shadow and `ink` text; counts in mono `ink-3` on the right. Areas collapse with a chevron; projects indent 38 px with a 6 px `line-strong` dot. The icon rail (56 px) uses 36 px squares with the same active treatment. Mobile tab bar: four tabs (Today · Inbox · Week · Browse), 22 px icons, 10.5 px labels, active in `ink`; counts as a 16 px `ink` badge. Browse is the phone's sidebar: a search field, then areas and projects, Someday, Logbook, carried-over and Settings.

### Sheet (mobile quick add)
Docks above the keyboard, 20 px top radius, 36×4 grabber, the input outlined in 1.5 px `ink`, parsed tokens rendered inline as chips, a row of 36 px suggestion chips, a 44 px "Add" primary button. The keyboard area is left to the system.

## 6. Iconography
Inline SVG on a 20-unit grid, 1.6 px stroke, round caps and joins, `currentColor`. Rendered at 18 px in navigation, 16 px in buttons, 14 px beside labels, 12 px inside chips. The set: inbox, sun (today), calendar, moon (someday/evening), book (logbook), search, plus, check, chevrons, clock, flag (deadline), grip (drag), carry (return arrow), cloud-check (sync), sliders (settings), lock, close. No emoji anywhere in the interface.

Logo mark: a 9-unit circle in `line-strong` with a thicker arc in `spare` from 12 o'clock to about 4 o'clock — the spare part of an hour. Wordmark in Instrument Serif at 21 px.

## 7. Motion
- Check-off: ring fills in 120 ms, title strikes through, row collapses after 400 ms (`ease-out`).
- Ribbon: segment widths and the hero number animate over 240 ms when a task is added, estimated or blocked; the number counts.
- Drag: the dragged row lifts with the FAB shadow; the drop slot fades in over 80 ms.
- Sheets and panels: 200 ms slide with a `cubic-bezier(0.2, 0.8, 0.2, 1)` curve.
- Nothing animates on page load; skeletons are static. With `prefers-reduced-motion`, durations drop to 0 and counts jump.

## 8. Copy voice
Plain, second person, present tense, specific. "3h 20m spare" not "You have some free time." Over-capacity copy states the amount and offers one move: "40 minutes more than fits. Move something to tomorrow, or keep it and let the day breathe less." Empty states say what to do next in one line. Never "overdue", never an exclamation mark, never a pep talk.

## 9. Accessibility
- All essential text ≥ 4.5:1; large display text ≥ 3:1. Colour never carries meaning alone: segments also differ by pattern (dots, hatch, solid) and every chip has a label or icon.
- Focus is always visible (2 px `spare-fill` ring). Every drag interaction has a keyboard path (select a task, press `B`, choose a slot with arrows, Enter).
- Hit targets ≥ 44 px on touch; row actions on mobile are reached by swipe *and* by a long-press menu.
- Live regions announce capacity changes ("3 hours 20 minutes spare") when the ribbon updates.
- Time is always shown in the user's 24 h or 12 h preference; durations use "h" and "m" with a thin space, never "hrs".

## 10. Implementation notes (Tailwind v4)
Declare the tokens in `globals.css` under `@theme` so utilities like `bg-paper`, `text-ink-2`, `border-line`, `bg-spare-soft` exist; add `font-display`, `font-sans`, `font-mono` families via `next/font/google` (Instrument Serif, Instrument Sans, DM Mono). Keep the daylight gradient and the ribbon dot grid as two named utilities. The mockups' inline styles map one-to-one onto these tokens.
