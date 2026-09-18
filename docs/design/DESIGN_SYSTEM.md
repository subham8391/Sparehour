# Sparehour design system — "Daylight"

The working day as a strip of light. Everything on screen serves one number: how much time you actually have to spare. Calm by default, precise when you look closely, never a wall of red.

Mockups live in `docs/design/mockups/` (`*.dc.html`, one per screen) and are published as the "Sparehour Daylight" canvas. This document is the source of truth for tokens and rules; the mockups are the reference for how they combine.

## 1. Principles

1. **Green means spare time, and nothing else.** The accent is reserved for the hero number, the spare segment of the ribbon and "done by". Buttons, links in the app shell, selection and focus use ink, not green, so the eye learns that green = room to breathe.
2. **Colour is semantic, so it is rare.** Blue = other people's time (calendar events). Dark ink = time you chose (blocks). Amber = gently over, or the evening. Ember = a real deadline only. Nothing else gets a colour.
3. **Never make the user feel behind.** No red counts, no badges of shame, no "overdue" language. A missed day carries over quietly; an over-planned day gets amber and a sentence, not an alarm.
4. **Instrument, not dashboard.** One hero figure, one ribbon, then lists. Tick marks, hairlines and tabular numbers instead of stat tiles and charts.
5. **Type carries the identity.** The serif does the emotional work at large sizes; the sans stays quiet at UI sizes and, with tabular figures, makes every time and duration line up. There is no third voice.
6. **Keyboard-first, touch-friendly.** Every action has a key; every mobile target is at least 44 px.
7. **Motion is feedback, not decoration.** A check-off settles, a block snaps into a slot, a ribbon animates when spare time changes. Nothing moves on load. Respect `prefers-reduced-motion`.

## 2. Colour tokens

Refined Daylight (DECISIONS.md Q26, 2026-09-18). Derived in OKLCH so both themes share the same chroma and lightness logic: every neutral carries a faint green bias (hue 165, chroma 0.005–0.011) so the greys read as chosen, not defaulted; the sunken surfaces are a step cooler than the paper. Accents share hue families — green 165, blue 262, amber 70, ember 30 — and every family has four roles at fixed lightness: text (L 0.50 light / 0.80 dark), fill (0.60 / 0.70), soft (0.94 / 0.30 at C ≈ 0.03) and line (0.80 / 0.45). Dark is designed, not inverted: tints desaturated, the fixed lightness order ink > spare > spare-fill > block-fill > surfaces, hairlines at L 0.34, elevation by tone and a hairline rather than shadow.

The token names are the API: every component references one of these and nothing else. Never a `dark:` utility, never a raw colour in a component.

| Token | Role | Light | Dark |
|---|---|---|---|
| `paper` | App ground | `#F4F8F6` oklch(97.6% 0.005 165) | `#0C110F` oklch(17.1% 0.009 169) |
| `surface` | Cards, panes, inputs | `#FFFFFF` | `#151917` oklch(20.8% 0.007 164) |
| `surface-2` | Sunken: chips, selected row, planned blocks on the timeline | `#EDF1EF` oklch(95.5% 0.005 165) | `#1E2320` oklch(25.0% 0.009 159) |
| `surface-3` | Raised: popovers, quick-add, palette, toast (with `shadow-2` in light, a `line-strong` hairline in dark) | `#FFFFFF` | `#282D2A` oklch(29.1% 0.009 160) |
| `hover` / `press` | Row hover, button press washes | ink / 5 % · ink / 8 % | white / 6 % · white / 10 % |
| `scrim` | Behind sheets and dialogs | `rgb(25 37 31 / .32)` | `rgb(0 0 0 / .55)` |
| `line` | Hairlines, hour lines | `#D9E0DD` oklch(90.0% 0.009 169) | `#343937` oklch(33.9% 0.008 170) |
| `line-strong` | Hovered borders, kbd, secondary-button border | `#BEC6C2` oklch(81.9% 0.010 165) | `#4F5451` oklch(44.0% 0.008 160) |
| `line-control` | Check rings, input borders (a UI component: ≥ 3:1) | `#7F8683` oklch(61.3% 0.009 169) | `#7A817E` oklch(59.6% 0.009 169) |
| `ink` | Text, primary buttons, the now cursor, the focus ring | `#161C19` oklch(21.9% 0.011 164) | `#E8ECEA` oklch(93.9% 0.005 165) |
| `ink-2` | Secondary text: project names, meta, contributors | `#555B58` oklch(46.5% 0.009 165) | `#AFB8B4` oklch(77.4% 0.011 168) |
| `ink-3` | Labels, ticks, counts | `#5F6663` oklch(50.3% 0.010 168) | `#98A19D` oklch(70.1% 0.012 168) |
| `ink-4` | Placeholders and disabled text only, never essential | `#818885` oklch(62.0% 0.009 169) | `#808884` oklch(61.9% 0.011 165) |
| `ink-inverse` | Text on ink | = `paper` | = `paper` |
| `spare` | *spare*, "done by", free-gap labels | `#1A7455` oklch(49.9% 0.096 165) | `#7CD2AE` oklch(79.9% 0.099 165) |
| `spare-fill` | Dot grid, finish cursor, the logo slice | `#19966E` oklch(59.9% 0.120 165) | `#46B68C` oklch(70.1% 0.120 165) |
| `spare-soft` | Ribbon track, done-by pill | `#D7F3E5` oklch(94.0% 0.035 164) | `#1C3329` oklch(29.8% 0.035 165) |
| `spare-line` | Edge of the done-by pill | `#7FD2AE` oklch(80.1% 0.097 165) | `#0A6548` oklch(45.0% 0.092 165) |
| `meet` | Meeting text, project token text | `#43629C` oklch(50.0% 0.100 262) | `#9BBEFF` oklch(80.0% 0.100 262) |
| `meet-fill` | Meeting segments, block edge | `#5F80BC` oklch(60.1% 0.100 262) | `#7C9EDD` oklch(69.9% 0.101 262) |
| `meet-soft` | Meeting blocks, project token | `#E0ECFF` oklch(94.0% 0.029 260) | `#262E3D` oklch(30.0% 0.030 263) |
| `meet-line` | Reserved (meeting card edge) | `#A2BEF2` oklch(79.9% 0.080 263) | `#3C5582` oklch(45.1% 0.080 262) |
| `over` | Gentle-ask text, the over state | `#875814` oklch(50.1% 0.100 70) | `#E7B375` oklch(80.1% 0.100 71) |
| `over-fill` | The over-tail past the end of the day | `#AA732B` oklch(60.0% 0.110 70) | `#CA924C` oklch(70.1% 0.110 70) |
| `over-soft` | Gentle-ask panel | `#FEEBD6` oklch(95.0% 0.035 70) | `#392B1A` oklch(30.0% 0.035 71) |
| `over-line` | Edge of the gentle-ask panel and the over chip | `#E3B47F` oklch(80.0% 0.088 69) | `#744B13` oklch(44.9% 0.088 69) |
| `deadline` | Near-deadline chip text, the only warm red | `#A8493D` oklch(52.7% 0.128 29) | `#FDA293` oklch(80.0% 0.111 30) |
| `deadline-fill` | The flag glyph in a near chip | `#C15E4F` oklch(59.9% 0.130 30) | `#E47D6D` oklch(70.0% 0.130 30) |
| `deadline-soft` | Near-deadline chip | `#FFE3DE` oklch(93.7% 0.032 30) | `#3C2824` oklch(30.0% 0.031 32) |
| `deadline-line` | Reserved | `#F9A496` oklch(79.9% 0.104 30) | `#853B31` oklch(44.9% 0.104 30) |
| `block-fill` | Planned time on the ribbon (never ink) and the block's edge on the timeline | `#292F2C` oklch(29.8% 0.010 164) | `#7B827F` oklch(60.0% 0.009 169) |
| `block-soft` | A planned block on the timeline | = `surface-2` | = `surface-2` |
| `hatch` | The elapsed hatch over the track | ink / 16 % | ink / 16 % |
| `daylight` | The one gradient: cool at the start of the day, warm at the end, over the timeline pane only | `linear-gradient(180deg, oklch(96% .012 235 / .7), transparent 42%, oklch(96.5% .018 75 / .75))` | `linear-gradient(180deg, oklch(26% .014 235 / .55), transparent 42%, oklch(26% .016 70 / .6))` |

Shadows are tinted with the paper's own ink (`rgb(25 37 31)`) and exist on three things only: `shadow-2` on raised panels (`0 1px 2px /.05, 0 4px 10px /.07, 0 12px 28px /.08`), `shadow-float` on the phone sheet (`0 -12px 40px /.18`), `shadow-fab` on the FAB (`0 8px 20px /.22`); `shadow-active` (`0 1px 2px /.06, 0 0 0 1px line`) marks the active sidebar item. Cards are flat. In dark the raised and card shadows are `none` and the sheet and FAB use black at 50 % / 45 %.

### Measured contrast (WCAG ratio · APCA Lc)

Every pairing the code actually uses, both themes. Alpha tints are resolved on `surface`. The end-to-end suite runs axe's colour-contrast check on the real pages, so a token that slips below AA fails CI.

Light, text (needs 4.5:1):

| Pairing | Ratio | Lc |
|---|---|---|
| ink on paper / surface / surface-2 | 16.2 / 17.3 / 15.2 | 99 / 104 / 95 |
| ink on surface-2/60, paper/90, over-soft/40 | 15.6 / 16.2 / 16.3 | 97 / 99 / 100 |
| ink-2 on paper / surface / surface-2 | 6.5 / 7.0 / 6.1 | 79 / 84 / 75 |
| ink-2 on surface-2/60, paper/90, over-soft/40 | 6.3 / 6.5 / 6.6 | 77 / 79 / 80 |
| ink-3 on paper / surface / surface-2 | 5.5 / 5.9 / 5.2 | 75 / 80 / 71 |
| ink-3 on surface-2/60, paper/90, over-soft/40 | 5.3 / 5.5 / 5.6 | 72 / 75 / 75 |
| ink on over-soft, ink on spare-soft (search mark), ink-2 on over-soft | 14.9 / 14.7 / 6.0 | 94 / 93 / 74 |
| paper on ink | 16.2 | −101 |
| spare on spare-soft / surface / paper / surface-2 | 4.9 / 5.7 / 5.3 / 5.0 | 67 / 78 / 74 / 69 |
| meet on meet-soft / surface / paper / surface-2 | 5.1 / 6.1 / 5.7 / 5.3 | 68 / 80 / 75 / 71 |
| over on over-soft / surface / paper / surface-2 | 5.3 / 6.1 / 5.7 / 5.4 | 70 / 80 / 76 / 71 |
| deadline on deadline-soft / surface / paper / surface-2 | 4.7 / 5.7 / 5.3 / 5.0 | 65 / 78 / 73 / 69 |

Light, UI components (need 3:1): line-control on paper / surface / surface-2 3.5 / 3.7 / 3.3 · spare-fill on the track 3.2, on surface 3.7 · meet-fill on the track 3.4, on surface 4.0 · over-fill on the track 3.4, on surface 4.0 · block-fill on the track 11.6 · focus ring (ink) on surface 17.3, on paper 16.2 · ink-4 placeholders 3.6 (non-essential).

Dark, text:

| Pairing | Ratio | Lc |
|---|---|---|
| ink on paper / surface / surface-2 | 16.0 / 14.9 / 13.4 | −94 / −94 / −93 |
| ink on surface-2/60, paper/90, over-soft/40 | 14.5 / 16.0 / 13.6 | −93 / −94 / −93 |
| ink-2 on paper / surface / surface-2 | 9.4 / 8.7 / 7.9 | −62 / −62 / −60 |
| ink-2 on surface-2/60, paper/90, over-soft/40 | 8.5 / 9.4 / 8.0 | −61 / −62 / −61 |
| ink-3 on paper / surface / surface-2 | 7.2 / 6.7 / 6.0 | −50 / −49 / −48 |
| ink-3 on surface-2/60, paper/90, over-soft/40 | 6.5 / 7.2 / 6.1 | −49 / −50 / −48 |
| ink on over-soft, ink on spare-soft, ink-2 on over-soft | 11.5 / 11.3 / 6.7 | −90 / −90 / −58 |
| paper on ink | 16.0 | 94 |
| spare on spare-soft / surface / paper / surface-2 | 7.5 / 9.9 / 10.6 / 8.9 | −65 / −68 / −69 / −67 |
| meet on meet-soft / surface / paper / surface-2 | 7.3 / 9.5 / 10.2 / 8.5 | −63 / −66 / −67 / −65 |
| over on over-soft / surface / paper / surface-2 | 7.2 / 9.4 / 10.1 / 8.4 | −62 / −66 / −66 / −64 |
| deadline on deadline-soft / surface / paper / surface-2 | 7.1 / 9.1 / 9.8 / 8.2 | −61 / −64 / −65 / −63 |

Dark, UI components: line-control 4.8 / 4.5 / 4.0 · spare-fill on the track 5.4, on surface 7.0 · meet-fill 5.0 / 6.6 · over-fill 5.0 / 6.5 · block-fill on the track 3.4, on surface 4.5 · line on surface 1.5 (was 1.3), line-strong 2.3 · focus ring on surface 14.9.

The tightest pairs are deadline on deadline-soft (4.7, light) and line-control on surface-2 (3.3, light). Both pass. Dark lightness order, as required: ink 0.94 > spare 0.80 > spare-fill 0.70 > block-fill 0.60 > surfaces 0.17–0.29.

**Never:** pure `#000`/`#fff` text, a red anywhere except the near-deadline chip, gradients on controls, green on anything that is not spare time.

### Theme mechanics
Tokens are CSS custom properties on `:root` (light, `color-scheme: light`). `@media (prefers-color-scheme: dark)` redefines them under `:root:not([data-theme="light"])`; `:root[data-theme="dark"]` redefines them again so an explicit choice wins in both directions; both dark blocks set `color-scheme: dark` so native controls and scrollbars follow. A tiny inline script in the root layout reads `localStorage["sparehour.theme"]` and stamps `data-theme` before the first paint, so a chosen theme never flashes the OS one; `applyTheme` keeps the `theme-color` metas on the stamped theme's paper. Components only ever reference tokens; `body` sets `background: var(--paper)` explicitly.

## 3. Typography

| Role | Face | `next/font/google` | Fallback stack | Use |
|---|---|---|---|---|
| Display | **Newsreader** (variable weight, optical-size axis) | `Newsreader({ axes: ["opsz"], style: "normal" })`, preloaded, ≈ 128 KB | Iowan Old Style, Georgia, serif | The spare-time number, screen titles, pane titles ("Your day"), ritual headings, the empty-state fact line, the wordmark. Weight 450 (`font-book`); 500 for pane titles. Never below 20 px. No tracking. |
| Display italic | **Newsreader** 400 italic (static) | `Newsreader({ weight: "400", style: "italic", preload: false })`, ≈ 23 KB | as above | The one qualifier word: *spare* / *over*. Nothing else. |
| UI | **Instrument Sans** (variable 400–700) | `Instrument_Sans()`, preloaded, ≈ 29 KB | Helvetica Neue, Helvetica, Arial, sans-serif | Everything else, including every time, duration, count, tick and chip, with `font-variant-numeric: tabular-nums` (the `num` utility). Untracked at 13–15 px. |
| Mono | system stack (`ui-monospace`, SF Mono, Menlo, Consolas) | none loaded | — | `kbd` only. There is no data mono: times live in the sans. |

Font bytes ≈ 180 KB (was 76 KB with three faces); only the roman display and the sans are preloaded. Google strips `case`, `zero` and the stylistic sets from served files, so nothing relies on them; `tnum` survives for both faces. `font-optical-sizing: auto` is left on so Newsreader thickens at pane-title sizes and does not go spindly in dark.

### Scale (only the display steps are fluid)

Tokens are `--text-*` in `globals.css` with paired line-heights, so `text-hero`, `text-body-sm` and so on carry both. Ad-hoc pixel sizes are retired as screens are restyled.

| Token | Phone (≤ 412) | Desktop (1440) | Line | Face / weight | Use |
|---|---|---|---|---|---|
| `hero` | 40 | 56 · `clamp(2.5rem, 2.167rem + 1.481vw, 3.5rem)` | 1.0 | Newsreader 450, `nowrap`, tabular | the spare number |
| `em` | 24 | 32 · `clamp(1.5rem, 1.333rem + 0.741vw, 2rem)` | 1.0 | Newsreader italic 400 | *spare* / *over* |
| `title` | 26 | 34 · `clamp(1.625rem, 1.458rem + 0.741vw, 2.125rem)` | 1.1 | Newsreader 450, `text-wrap: balance` | screen h1 |
| `pane` | 20 | 22 · `clamp(1.25rem, 1.208rem + 0.185vw, 1.375rem)` | 1.2 | Newsreader 500 | "Your day", wordmark, ritual headings, empty-state fact |
| `heading` | 17 | 17 | 24 px | sans 600 | dialog and sheet headings |
| `body-lg` | 15 (16 in inputs) | 15 | 20 px | sans 400 | task titles, quick-add |
| `body` | 14 | 14 | 20 px | sans 400 | sidebar, settings, buttons (500) |
| `body-sm` | 13 | 13 | 18 px | sans 400 / 500 | chips, subtitles, row actions |
| `label` | 12 | 12 | 16 px | sans 500 / 600; eyebrows uppercase, `tracking-eyebrow` (0.07 em) | eyebrows, meta |
| `micro` | 11 | 11 | 14 px | sans 500 tabular | gutter, ticks, kbd |

Rules: `text-wrap: balance` on titles, `text-wrap: pretty` on paragraphs; tabular figures wherever digits align (`num`); body copy never wider than ~65 characters; the hero never wraps at 360 px (`white-space: nowrap`); no tracking on the serif or in the 13–15 px band; eyebrows are the only tracked text. One time format: `HH:MM`, durations as "1h 30m".

## 4. Spacing, shape, elevation

- **Spacing scale:** 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 28, 36, 40, 44. Siblings are laid out with flex/grid `gap`, never stacked margins.
- **Radii (tokens):** `xs` 4 (ribbon segments, check tick box), `sm` 6 (chips, timeline blocks, kbd at 5, inputs inside rows), `lg` 10 (buttons, segmented control, quick-add input), `xl` 12 (cards, the hero card, popovers), `sheet` 20 (phone sheets), `fab` 18 (the 56 px FAB), 999 (check ring, done-by pill, badges). `rounded-md` is a legacy alias of `sm`.
- **Borders:** 1 px `line` on cards; `line-control` on check rings (1.5 px) and input borders; `line-strong` on kbd and secondary buttons; 3 px left edge on timeline blocks (`meet-fill` or `block-fill`).
- **Elevation:** cards are flat (hairline only). Raised panels are `surface-3` + `shadow-2` (`shadow-raised`); the phone sheet `shadow-float` (`shadow-sheet`); the FAB `shadow-fab` (`shadow-lift`); the active nav item `shadow-active` (`shadow-nav`). Dark drops the raised shadow and uses a `line-strong` hairline instead (§2).
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
The one iconic instrument: the day drawn as a rule. Anatomy, top to bottom:

- **Cursors above the track** (11 px 600, tabular): the now cursor's time ("11:20") in `ink` and the finish cursor's time ("16:00") in `spare`, each centred on its mark; the hour label beneath that would collide with the now time yields to it.
- **Track** 24 px on desktop, 16 px on the phone, radius `xs`, `overflow: visible`: `ribbon-track` = `spare-soft` with a 6 px dot grid in `spare-fill` (`radial-gradient(circle at 2px 2px, spare-fill .9px, transparent 1.15px)`). Segments: calendar events `meet-fill`, planned blocks `block-fill`, radius 3 (never ink, so the hero number stays the darkest thing on the card). The elapsed part of the day is `ribbon-elapsed`: a 135° hatch (`repeating-linear-gradient(135deg, hatch 0 1.2px, transparent 1.2px 5px)`) laid over whatever is beneath. The **now cursor** is 2 px `ink`, 4 px taller than the track at each end, with a 1 px `surface` halo so it reads over a block. The **finish cursor** is a 1.5 px dashed `spare-fill` line the height of the track.
- **Ticks beneath** (`ribbon-ticks`, driven by `--ribbon-hours`): an 8 px `line-control` tick at every hour, 4 px `line-strong` ticks at the quarters, a closing tick at the end; hour labels (11 px 500 `ink-3`, tabular, two digits) under the hour ticks, every hour at ≥ 340 px of track and every second hour below that; the first label left-aligned, the last right-aligned.
- **States:** *spare* (track green, hero number in `ink`, *spare* in `spare` italic, contributors "4h 45m planned · 1h in meetings", "done by 16:00" in `spare`) · *fits exactly* (track `surface-2`, "0m spare" in `ink-2`) · *over* (an `over-soft` tail edged in `over-line` extends past the end of the day, the number in `ink` with *over* in `over`, one sentence with one suggested move: "~40m spills past 18:00 — move *Fix the pricing page hero* to tomorrow."). The number never wraps and its width is reserved so it does not jitter; it counts over 240 ms only when the person changed something, never on load or the minute tick, and the real value stays in the DOM for assistive tech.
- **Heights:** 24 px on Today and the Morning plan, 16 px on the phone, 6 px as the per-day capacity bar on the week planner (no ticks, no cursors).

On the phone the hero card holds the number, the one-line contributors and the small ribbon; the List | Day control does not live in the card: it sits on the **ritual row** beneath it, a 44 px row with "Morning plan ›" on the left, its status in `ink-3` ("Not planned yet"; from the projected finish onward "Shutdown ›" with "done by 16:00"), and the 44 px segmented control on the right.

### Task row
**Desktop (≥ 640 px):** grid `[44 ring] [1fr title] [auto project] [auto chips] [132 px hover zone]`, 44 px min height, 16 px inline padding, rows separated by a top hairline. At rest: the check ring (18 px, 1.5 px `line-control`, `ink` on hover), the title (`body-lg`, one line, ellipsis), the project name in `ink-2` on cross-project views, then at most three chips in the order time → deadline → estimate: **one** time chip (a block chip with a 7 px ink square if a block exists, else the do-time), the deadline chip (neutral with a flag, ember only when today, passed or ≤ 2 days: "Tomorrow", "2d late"), the estimate ("45m", or the dashed "30m?" guess). Carry count "×3" in `ink-3` before the estimate, omitted at ×1. The 132 px zone on the right is reserved for the actions (→ Tmr, ▪ Block, ⋯), which appear at 80 ms opacity on hover, `:focus-within` and the J/K highlight and never take layout. Hover = `hover` wash; selected = `surface-2`; highlight = a 2 px inset ink bar on the left; pressed = `press`. Completing: ring fills ink and settles, title strikes through in `ink-3`, the row folds (§7).

**Phone (< 640 px):** grid `16 | 44 ring | 12 | 1fr | 8 | 44 ⋯ | 16`, 56 px min height. Line 1: the title at 15/1.35, clamped to two lines, `overflow-wrap: anywhere`, never sacrificed. Line 2: 12 px meta in `ink-2` joined by " · " (block or time · estimate · deadline chip · project), every piece `nowrap`, the line fading out at the right edge rather than wrapping. The whole row opens the detail; the ring and the trailing ⋯ are the only other targets, each 44 px. No inline action buttons: the actions live in the ⋯ sheet, on long-press, and on swipe (right = advance, left = push away; Drop never on a full swipe).

### Carried-over row and the gentle ask
Same as a task row plus a carry count (`×2`, tabular, `ink-3`, before the estimate) and quick actions `Today · Tomorrow · Someday · Drop`. After the third carry an inline panel appears under the row in `over-soft`: "Carried over three times — still want this?" with `Keep today · Someday · Break it down · Drop` in `over`. "Keep today" is first because a no-penalty yes must exist; the panel is dismissible and never blocks the list.

### Timeline (day pane)
68 px per hour, hour lines `line`, half-hour lines `#E5EAE7` (dark `#232A26`), gutter labels mono 11 in `ink-3`. Events: 6 px radius, 3 px left border, 12.5 px text, mono time on the right or a second line when the event is taller than 40 px. Meetings use `meet-soft` / `meet-fill` / `meet`; blocks use `surface-2` / `ink`. Past events at 55% opacity. Now-line: 1.5 px `ink` with a 9 px dot in the gutter and the current time in mono 500. Projected finish: 1.5 px dashed `spare` with a `spare-soft` pill "done by 4:30pm". Dragging a task over the timeline shows a dashed `line-strong` slot snapped to 5 minutes with its start time; dropping creates a block and writes it to the chosen calendar.

### Buttons
One scale: 36 px on desktop, 44 px on the phone, 48 px for a sheet's full-width primary; radius `lg` (10); `body` at 500; pressed `scale(.97)`. Primary: `ink` background, `ink-inverse` text. Secondary: `surface` with a 1 px `line-strong` border. Quiet: `ink-2`, `ink` with the `hover` wash on hover. Link (text button): `ink`, radius `sm`, the `hover` wash. No green buttons, ever. Focus ring: 2 px `ink` at 2 px offset, following the element's radius; inputs whose border switches to ink get no ring.

### Chips and tokens
Chip: one family, 22 px (20 on the phone meta line), radius `sm`, `body-sm` 500, tabular, `nowrap`, never shrinking; `surface-2` / `ink-2` by default. Tones: time (clock glyph), deadline (flag, neutral unless near), near (`deadline-soft` / `deadline`, the flag in `deadline-fill`), block (`ink` 600 with a 7 px ink square), meet (project token), over (`over-soft` edged in `over-line`), spare (the done-by pill only, `spare-soft` edged in `spare-line`, fully round), guess (dashed `line-control`). Dates are human: "Today", "Tomorrow", "Fri", "22 Sep", "2d late". Status chips ("Planned at 9:12 · 2 min", "Synced · works offline") stay neutral — `surface-2` / `ink-2` with a check icon — so green keeps its one meaning. Quick-add tokens (26 px, radius 7): date `spare-soft`, estimate `surface-2` mono, project `meet-soft` / `meet`, tag `surface-2`.

### Keyboard hints
`kbd`: 20 px, the system mono at 11 px 500 in `ink-3`, `surface` with a 1 px `line-strong` border and a 2 px bottom edge, radius 5; hidden on touch devices. Shown beside "Add a task" (Q), in the search field (⌘K) and in the command palette.

### Navigation
Sidebar items 34 px, radius 8, `ink-2`; active = `surface` background with the 1 px ring shadow and `ink` text; counts in mono `ink-3` on the right. Areas collapse with a chevron; projects indent 38 px with a 6 px `line-strong` dot. The icon rail (56 px) uses 36 px squares with the same active treatment. Mobile tab bar: four tabs (Today · Inbox · Week · Browse), 22 px icons, 10.5 px labels, active in `ink`; counts as a 16 px `ink` badge. Browse is the phone's sidebar: a search field, then areas and projects, Someday, Logbook, carried-over and Settings.

### Sheet (mobile quick add)
Docks above the keyboard, 20 px top radius, 36×4 grabber, the input outlined in 1.5 px `ink`, parsed tokens rendered inline as chips, a row of 36 px suggestion chips, a 44 px "Add" primary button. The keyboard area is left to the system.

## 6. Iconography
Inline SVG on a 20-unit grid, 1.6 px stroke, round caps and joins, `currentColor`. Rendered at 18 px in navigation, 16 px in buttons, 14 px beside labels, 12 px inside chips. The set: inbox, sun (today), calendar, moon (someday/evening), book (logbook), search, plus, check, chevrons, clock, flag (deadline), grip (drag), carry (return arrow), cloud-check (sync), sliders (settings), lock, close. No emoji anywhere in the interface.

Logo mark: a 9-unit circle in `line-strong` with a thicker arc in `spare` from 12 o'clock to about 4 o'clock — the spare part of an hour. Wordmark in Instrument Serif at 21 px.

## 7. Motion

Instant by default; motion only when a thing changes state or place because the person acted. One hero moment (the number). Everything is CSS; there is no motion library.

| Token | Value | Use |
|---|---|---|
| `--dur-fast` | 120 ms | ring fill, fades, colour (`dur-fast`) |
| `--dur-base` | 200 ms | sheet contents, toast (`dur-base`) |
| `--dur-slow` | 240 ms | row fold, ribbon segment moves, phone sheet in (`dur-slow`); hard cap 300 ms |
| `--ease-out-quart` | `cubic-bezier(.23, 1, .32, 1)` | enter / leave |
| `--ease-in-out-quart` | `cubic-bezier(.77, 0, .175, 1)` | on-screen moves |
| `--ease-drawer` | `cubic-bezier(.32, .72, 0, 1)` | phone sheets |
| `--ease-settle` | `linear(0, .4 20%, .9 45%, 1.038 65%, .995 85%, 1)` | the check ring only (3.8 % overshoot) |

- **Check-off:** ring press `scale(.9)` → fill over 120 ms with `--ease-settle` → title strikes through → the row folds (`grid-template-rows: 1fr → 0fr` + opacity) over 240 ms after a 160 ms delay, reaching 0 exactly at the 400 ms write. A second tap within 400 ms cancels with no write.
- **Sheets:** the phone quick-add slides up 240 ms `--ease-drawer` and out in 180 ms; desktop quick-add and the palette are instant with an 80 ms scrim fade; the phone detail pushes from the right in 220 ms; ritual steps crossfade in 120 ms.
- **Ribbon:** segment `left` / `width` transition over 240 ms; the number counts over 240 ms, only on a user-caused change.
- **Pressed:** buttons and chips `scale(.97)`, the FAB `.94`, rows use the `press` wash and never scale; tap highlight removed; `cursor: pointer` on everything actionable as one base rule.
- **Hover reveal:** 80 ms opacity, 0 ms delay, gated on `(hover: hover) and (pointer: fine)`; the same zone shows on `:focus-within` and the keyboard highlight.
- **Never animate:** the palette, navigation, keyboard highlight moves, drag-follow, anything on page load; skeletons are static.
- **Reduced motion is graded, not blanket:** the 120 ms opacity and colour fades stay, every movement collapses to nothing (`transition-property` limited to opacity, colour, background, border and shadow; animations to 0), every transform utility is authored `motion-safe:`, and the row-fold delay is skipped in JS as it is today.

## 8. Copy voice
Plain, second person, present tense, specific. "3h 20m spare" not "You have some free time." Over-capacity copy states the amount and offers one move: "40 minutes more than fits. Move something to tomorrow, or keep it and let the day breathe less." Empty states say what to do next in one line. Never "overdue", never an exclamation mark, never a pep talk.

## 9. Accessibility
- All essential text ≥ 4.5:1; large display text ≥ 3:1. Colour never carries meaning alone: segments also differ by pattern (dots, hatch, solid) and every chip has a label or icon.
- Focus is always visible (2 px `ink` ring, 2 px offset, following the radius; never a double ring on inputs). Every drag interaction has a keyboard path (select a task, press `B`, choose a slot with arrows, Enter).
- Hit targets ≥ 44 px on touch; row actions on mobile are reached by swipe *and* by a long-press menu.
- Live regions announce capacity changes ("3 hours 20 minutes spare") when the ribbon updates.
- Time is always shown in the user's 24 h or 12 h preference; durations use "h" and "m" with a thin space, never "hrs".

## 10. Implementation notes (Tailwind v4)
Declare the tokens in `globals.css` (three theme blocks) and expose them under `@theme inline` so utilities like `bg-paper`, `text-ink-2`, `border-line`, `bg-spare-soft`, `text-body-sm`, `rounded-sheet`, `shadow-raised`, `ease-out-quart` exist; `font-display`, `font-display-italic` and `font-sans` come from `next/font/google` (Newsreader, Newsreader italic, Instrument Sans) in `src/app/layout.tsx`, `font-mono` is the system stack. The ribbon's instruments are utilities: `ribbon-track`, `ribbon-elapsed`, `ribbon-ticks` (with `--ribbon-hours`), `bg-daylight`; `num` sets tabular figures; `dur-fast` / `dur-base` / `dur-slow` set durations. Primitives live in `src/ui` (`Button`, `Chip` / `DeadlineChip`, `Kbd`, `SectionLabel` / `SectionAction`, `ListCard` / `EmptyCard`, `Input` / `Textarea`, `Segmented`, `FieldPopover` / `MenuButton`, `relativeDay` / `deadlineWording`) and are consumed by `src/features` and `src/app`; `src/core` never imports them.
