# Chess Training App — Design Spec

Design guidance for building the UI. Read this before writing any component or
CSS. Everything here is normative unless marked *guidance*.

**Aesthetic in one line:** high desert. Juniper green on bone and sand, a dusty
sky blue for anything the engine says, warm black ink, one clean bold
grotesque, sharp-ish corners, generous air. Quiet chrome so the board and the
numbers carry the screen.

**Stack context:** Next.js App Router + TypeScript. Tokens live in
`src/app/globals.css` as CSS custom properties. Components use CSS Modules
(`*.module.css`) and read tokens via `var(--*)`. No Tailwind, no CSS-in-JS, no
component library — a chess board and an eval readout are custom work anyway.

---

## 1. Tokens

Replace the contents of `src/app/globals.css` with this token block plus the
base reset. Never hard-code a hex, font name, or radius that a token already
carries.

```css
:root {
  color-scheme: light dark;

  /* ── Ground ───────────────────────────────────────────── */
  --bone:        #f6f2ea;  /* page background */
  --sand:        #ece5d7;  /* raised surface: cards, panels, inputs */
  --sand-deep:   #ded5c2;  /* pressed / inset / table stripe */
  --edge:        #cec4ad;  /* 1px borders, dividers */

  /* ── Ink ──────────────────────────────────────────────── */
  --ink:         #1a1917;  /* primary text */
  --ink-2:       #4d4a43;  /* secondary text, labels */
  --ink-3:       #7b766b;  /* tertiary, placeholder, disabled label */

  /* ── Juniper (primary accent) ─────────────────────────── */
  --jun-100:     #e6ece6;
  --jun-200:     #c9d6cb;
  --jun-300:     #a3b8a8;
  --jun-400:     #7b9482;
  --jun-500:     #57705c;  /* base — board dark squares, primary fill */
  --jun-600:     #445a49;  /* hover */
  --jun-700:     #334537;  /* pressed, text-on-tint */
  --jun-800:     #223026;

  /* ── Sky (secondary accent) — dusty desert sky, not a UI blue ── */
  --sky-100:     #e8eff5;
  --sky-200:     #cbdce8;
  --sky-300:     #a4bfd1;
  --sky-400:     #7ba0b8;
  --sky-500:     #5c85a0;  /* base — data series, informational chrome */
  --sky-600:     #486d87;  /* hover */
  --sky-700:     #37556c;  /* text-on-tint */
  --sky-800:     #263e50;

  /* ── Semantic (move quality, status) ──────────────────── */
  --rust-500:    #a6552f;  /* blunder, destructive, check */
  --rust-100:    #f3e2d8;
  --ocher-500:   #b8862f;  /* inaccuracy, warning, last-move highlight */
  --ocher-100:   #f4ead3;
  --good:        var(--jun-500);   /* best / excellent move */
  --good-tint:   var(--jun-100);

  /* ── Board ────────────────────────────────────────────── */
  --sq-light:    #ede4d2;
  --sq-dark:     #57705c;
  --piece-white: #f9f6f0;
  --piece-black: #23231f;
  --piece-edge:  #1a1917;  /* outline on both colors, 1.5px equivalent */

  /* ── Type ─────────────────────────────────────────────── */
  --font-sans: "Archivo", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, monospace;

  /* ── Space — 4px base, no half-steps ──────────────────── */
  --s-1: 4px;  --s-2: 8px;  --s-3: 12px; --s-4: 16px;
  --s-5: 24px; --s-6: 32px; --s-7: 48px; --s-8: 64px;

  /* ── Radius — restrained; this is not a soft product ──── */
  --r-sm: 3px;   /* chips, inputs, small controls */
  --r-md: 6px;   /* buttons, cards, panels */
  --r-lg: 10px;  /* dialogs, the board frame */

  /* ── Elevation — ink-tinted, barely there ─────────────── */
  --sh-1: 0 1px 2px rgba(26, 25, 23, 0.07);
  --sh-2: 0 4px 14px rgba(26, 25, 23, 0.10);
  --sh-3: 0 18px 44px rgba(26, 25, 23, 0.18);
}

@media (prefers-color-scheme: dark) {
  :root {
    --bone: #1a1917; --sand: #232219; --sand-deep: #2d2b24; --edge: #3d3a31;
    --ink: #ede7da;  --ink-2: #b3ab9a;  --ink-3: #837c6d;

    --jun-100: #232c25; --jun-200: #2f3d33; --jun-300: #486051;
    --jun-400: #6d8b76; --jun-500: #8da894; --jun-600: #a3bba9;
    --jun-700: #c2d3c6; --jun-800: #dde7e0;

    --sky-100: #1c252e; --sky-200: #28343f; --sky-300: #3c5366;
    --sky-400: #61879e; --sky-500: #8cadc3; --sky-600: #a7c3d3;
    --sky-700: #c5d9e5; --sky-800: #dfeaf1;

    --rust-500: #cf7a4d; --rust-100: #33211a;
    --ocher-500: #d8a851; --ocher-100: #332a19;

    --sq-light: #c2b79f; --sq-dark: #4a6050;
    --piece-white: #f2eee5; --piece-black: #191814; --piece-edge: #0f0e0c;

    --sh-1: 0 1px 2px rgba(0,0,0,0.5);
    --sh-2: 0 4px 14px rgba(0,0,0,0.55);
    --sh-3: 0 18px 44px rgba(0,0,0,0.65);
  }
}
```

Both modes are first-class. Note that the juniper ramp **inverts** in dark mode:
`--jun-500` is the accessible accent in both, but light in one and dark in the
other. Always reference roles (`--jun-500`), never assume direction, and never
write `#hex` in a component.

Provide a manual override too: a `[data-theme="light"]` / `[data-theme="dark"]`
attribute on `<html>` that re-declares the same blocks, with the media query as
the `auto` default. Persist the user's choice in `localStorage`.

---

## 2. Type

Load with `next/font/google` in `src/app/layout.tsx`, replacing Geist:

```ts
import { Archivo, IBM_Plex_Mono } from "next/font/google";
const sans = Archivo({ subsets: ["latin"], variable: "--font-sans-src",
                       axes: ["wdth"] });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400","500","600"],
                             variable: "--font-mono-src" });
```

Archivo carries everything: it is clean at 13px and genuinely bold at 700/800.
Do not add a third family.

| Role | Family | Size / line | Weight | Tracking |
| --- | --- | --- | --- | --- |
| Display (page title) | sans | 40 / 1.05 | 800 | −0.02em |
| H1 (section) | sans | 28 / 1.15 | 700 | −0.015em |
| H2 | sans | 20 / 1.25 | 700 | −0.01em |
| H3 / panel head | sans | 15 / 1.3 | 600 | 0 |
| Body | sans | 15 / 1.55 | 400 | 0 |
| Small / meta | sans | 13 / 1.45 | 400 | 0 |
| Label / eyebrow | sans | 11 / 1.2 | 600 | 0.09em, uppercase |
| **Move notation** | mono | 14 / 1.4 | 500 | 0 |
| **Eval / centipawns** | mono | 14 / 1.2 | 600 | 0 — tabular figures |
| FEN / PGN blocks | mono | 12 / 1.6 | 400 | 0 |

Anything numeric that a user will scan down a column — eval, centipawn loss,
clock, accuracy %, move number — is mono with `font-variant-numeric: tabular-nums`.
Never proportional figures in a table or a move list.

Body copy sits at `--ink`, secondary at `--ink-2`. Do not use juniper for
paragraph text; use `--jun-700` (light mode) if you need tinted prose.

---

## 3. Layout

- Board-centric screens use a fixed three-column shell: **left rail** 220px
  (nav / game list), **board column** flexible, **right panel** 340px (move
  list, eval, controls). Panels are `--sand` on a `--bone` page.
- Content maxes at 1440px, centered, with `--s-6` page gutters.
- The board is square and sized off available height:
  `min(72vh, 100% - 2 * var(--s-6))`, snapped to a multiple of 8 so squares
  land on whole pixels. Ranks/files never fall on fractional pixels.
- Desktop-first (per brief). Below 1100px, drop the left rail to icons; below
  900px, stack the right panel under the board. Do not build a mobile board.
- Prefer flex/grid with `gap` over margins for any group of siblings.
- Left-aligned throughout. Center only the board itself and empty states.

---

## 4. The board

The signature element. Get this right before anything else.

**Squares.** `--sq-light` / `--sq-dark`, flat fills, no gradient, no texture,
no inner shadow. a1 dark, h1 light. Board frame: `--r-lg` outer radius with
`overflow: hidden`, plus a 1px `--edge` ring. No drop shadow on the board.

**Coordinates.** Files a–h along the bottom, ranks 1–8 up the left, drawn
*inside* the edge squares in 10px/600 sans at 55% opacity of the *opposite*
square color. No coordinate gutter outside the board.

**Pieces.** The traditional Staunton drawings, kept as **flat one-color
silhouettes** — no interior line work, no shading, no bevel, no gradient. Do
not invent or simplify the shapes; use the standard set everyone already reads
as a chess piece.

- Source a standard Staunton SVG set rather than drawing one. The Wikimedia
  Commons set (Cburnett) is the usual choice and is what most clients use —
  check its license before vendoring and record the choice in the repo.
- Flatten whatever you source: strip internal strokes and fills so each piece
  is a single filled shape. If a piece needs two colors to read, it is the
  wrong source.
- Do not ship Unicode chess glyphs in production. They vary by platform font,
  carry per-font baseline offsets that push the piece off-center, and cannot be
  recolored per side.
- The design preview carries a simple stand-in set: one `<path>` per piece on a
  `0 0 100 100` viewBox, drawn at 82% of the square. Centering is exact because
  the viewBox is the square. Match this sizing and centering behavior with the
  real artwork.
- Size to 86% of the square, centered on visual mass rather than bounding box —
  kings and queens are taller and will sit low if you center the box.

**Fill and outline are asymmetric, on purpose.** Black pieces are solid
`--piece-black` with **no stroke**. White pieces are `--piece-white` with a
`--piece-edge` stroke of ~1.5px on a 60px square, because an unoutlined white
piece disappears on a light square.

**State layers**, painted under the piece and over the square:

| State | Treatment |
| --- | --- |
| Last move (from + to) | `--ocher-500` at 32% alpha, full square |
| Selected square | `--jun-700` at 22% alpha + inset 2px `--jun-700` ring |
| Legal destination (empty) | centered dot, 22% of square, `--ink` at 24% |
| Legal destination (capture) | 4px inset ring, `--ink` at 24% |
| Check | radial gradient from `--rust-500` at 55% center to transparent edge |
| Best-move hint | 2px `--ocher-500` arrow, 70% alpha, rounded cap |
| Blunder marker (review) | `--rust-500` arrow, same geometry |
| Premove | `--jun-400` at 20% alpha |
| Hover (drag target) | inset 3px `--ink` at 12% |

Stack order: square → last-move → check → selected → legal marker → piece →
arrows → drag ghost.

**Interaction.** Both click-click and drag-drop must work. Drag lifts the piece
to 1.06 scale with `--sh-2` and follows the cursor; illegal drops snap back in
120ms. Piece movement animates `transform: translate()` over 140ms
`cubic-bezier(.2,.8,.25,1)` — never `top`/`left`. Captures fade the taken piece
out over 90ms. Respect `prefers-reduced-motion: reduce` by making moves
instant (0ms) while keeping highlights.

---

## 5. Components

Specs are minimums. Every interactive element needs hover, active, focus-visible,
and disabled states — no browser defaults anywhere.

**Focus ring, globally:** `outline: 2px solid var(--jun-500); outline-offset: 2px;`
on `:focus-visible`. Never remove it. `::selection` is `--jun-200`.

### Buttons
Height 36px (compact 30px, prominent 44px), padding `0 var(--s-4)`, `--r-md`,
sans 14/600, `gap: var(--s-2)` to a 16px icon.

- **Primary** — `--jun-500` fill, `--bone` text; hover `--jun-600`; active
  `--jun-700`.
- **Secondary** — transparent fill, 1px `--edge`, `--ink` text; hover
  `--sand`; active `--sand-deep`.
- **Ghost** — no border, `--ink-2` text; hover `--sand`. Board controls
  (flip, next, prev, analyze) are ghost icon buttons, 34×34, `--r-sm`.
- **Destructive** — `--rust-500` fill, `--bone` text. Only for deleting
  imported data.
- Disabled: 45% opacity, `cursor: not-allowed`, no hover.

### Inputs
Height 36px, `--sand` fill, 1px `--edge`, `--r-sm`, 14px text, `--ink-3`
placeholder. Focus: border `--jun-500` + the focus ring at `outline-offset: 0`.
Caret `--jun-500`. Label above at 11/600 uppercase `--ink-2`, `--s-1` gap.
The chess.com username field is the app's front door — give it a `--s-7`-tall
row of its own with a 44px primary button beside it.

### Move list
The right panel's core. Two-column grid: move number (mono 13, `--ink-3`,
right-aligned, 32px) then white/black move pairs.

- Each move is a button, full-width in its cell, `--r-sm`, mono 14/500.
- Current move: `--jun-500` fill, `--bone` text.
- Hover: `--sand-deep`.
- A move-quality glyph sits right of the notation: `!` best (`--good`),
  `?!` inaccuracy (`--ocher-500`), `?` mistake (`--ocher-500`), `??` blunder
  (`--rust-500`). 12px mono 600. Nothing for a normal move — most moves are
  normal, and marking them is noise.
- Centipawn loss appears on hover as a mono 12 `--ink-3` suffix, not always-on.
- Variations indent `--s-4` and drop to `--ink-2`.

### Eval bar
Vertical, 12px wide, full board height, immediately left of the board, `--r-sm`.
White's share is `--piece-white`, black's is `--piece-black`, 1px `--edge`
around. The fill animates over 220ms ease-out. Numeric eval sits above the bar
in mono 14/600 tabular — `+1.24`, `−0.35`, `M4` for mate. Always signed from
white's perspective; state that in a tooltip. Mate flips the bar fully with no
animation.

### Move-quality chip
Inline pill, `--r-sm`, 11/600 uppercase, `padding: 2px var(--s-2)`.
Blunder `--rust-100` bg / `--rust-500` text; inaccuracy `--ocher-100` /
`--ocher-500`; best `--good-tint` / `--jun-700`. Text label, not icon-only.

### Game card (library / archive)
`--sand`, `--r-md`, `--s-4` padding, 1px `--edge`, no shadow at rest, `--sh-1`
on hover. Contents: opponent + rating (15/600), result as a 3px left border in
`--jun-500` (win) / `--ink-3` (draw) / `--rust-500` (loss), time control and
date in 13 `--ink-2`, then a mistake count as a mono figure. One line of
metadata, not three.

### Table (game archive, weak-spot breakdown)
Header row 11/600 uppercase `--ink-2`, 1px `--edge` bottom rule. Cells `--s-3`
padding, row rule at `--ink` 8%. Hover row `--sand`. No zebra striping and no
vertical rules. Numeric columns right-aligned mono tabular.

### Clock
Mono 20/600 tabular in a `--sand` block, `--r-sm`, `--s-2 --s-3` padding. Active
side gets 1px `--jun-500` border. Under 10 seconds, text goes `--rust-500` — no
flashing.

### Progress / weak-spot charts
Bars and sparklines only; no pie charts, no 3D, no gradients. Grid lines at
`--ink` 8%, axis labels 11 `--ink-2`. If a chart needs a legend to be read,
restructure it.

Series color is fixed, not arbitrary: **you** are always `--jun-500`, the
**engine or the reference line** is always `--sky-500`, and a third series (if
unavoidable) is `--sky-300`. Never re-map those between charts.

### The sky ramp — where it goes
Juniper is the app's voice: actions, the board, your own moves. Sky is the cool
counterweight — informational, never actionable. Use it for:

- Engine and analysis chrome: depth readout, node count, the analysis-running
  bar, PV lines — a `--sky-200` panel with **`--ink` mono text at 600**.
- The engine's series in any chart, and reference/average lines.
- Openings taxonomy: opening-name chips are `--sky-100` bg / `--sky-700` text.
- Neutral informational callouts: a `--sky-200` block with `--ink` text —
  distinct from rust errors and ocher warnings.
- The best-move hint arrow *when the engine suggested it*, keeping the juniper
  arrow for a move you actually played.

**Type on a sky tint is always full-strength `--ink`, never a soft sky step.**
The tint is the signal; the type on it still has to be the starkest thing in
the block. Sky steps 600–800 are for text on *bone*, not on sky.

Do not use sky for buttons, links, focus rings, or the board. Two accents on
screen at once is fine when they mean different things; two accents used
interchangeably is not.

### Dialog
`--sand` on a `rgba(26,25,23,0.5)` backdrop, `min(480px, 100%)`, `--r-lg`,
`--sh-3`, `--s-5` padding. Title 20/700, body 14 `--ink-2`, actions
right-aligned with `--s-2` gap. Traps focus; Escape closes.

### Nav (left rail)
`--bone` ground, no border, `--s-4` padding. Items 34px tall, `--r-sm`, 14/500,
16px Lucide icon + label, `--s-2` gap. Active item: `--jun-100` fill,
`--jun-700` text, 600. Hover: `--sand`. Brand mark at top in 16/800 with
`-0.02em` tracking.

### Empty, loading, error
- **Empty** — centered, max 380px: 15/600 line saying what is missing, one 13
  `--ink-2` line of what to do, one primary button. No illustration.
- **Loading** — skeleton blocks in `--sand-deep` at `--r-sm`, pulsing opacity
  0.5→0.9 over 1.4s. For engine analysis, show real progress (depth reached,
  moves analyzed) instead of a spinner; Stockfish runs long enough that a
  spinner is a lie.
- **Error** — inline `--rust-100` block, `--r-md`, `--s-3` padding,
  `--rust-500` 13/600 heading, plain-language cause, and a retry button.
  Never a bare stack trace or an HTTP status.

---

## 6. Icons

Lucide (`lucide-react`), 16px in controls, 20px in nav, stroke-width 1.75 —
lighter than Lucide's default, to match the type's clean edge. `currentColor`
always. No emoji anywhere in the product UI.

---

## 7. Motion

Fast and small. Nothing decorative.

| Thing | Duration | Easing |
| --- | --- | --- |
| Hover / color change | 90ms | `ease-out` |
| Piece move | 140ms | `cubic-bezier(.2,.8,.25,1)` |
| Eval bar | 220ms | `ease-out` |
| Panel / dialog enter | 160ms | `ease-out`, 4px rise + fade |
| Skeleton pulse | 1400ms | `ease-in-out`, infinite |

Animate `transform` and `opacity` only. Honor `prefers-reduced-motion: reduce`
by cutting all durations to 0 except the skeleton pulse.

---

## 8. Accessibility

- Body text ≥ 4.5:1 on its background; large text and chrome ≥ 3:1. The token
  pairs above already satisfy this — verify any new pair before shipping it.
- Move quality is never color-only: the `?!`/`??` glyph and the chip's text
  label carry the meaning.
- Board squares are keyboard reachable: arrow keys move a cursor, Enter selects
  and drops, Escape cancels. Each square has an `aria-label` of coordinate plus
  occupant ("e4, white pawn").
- The move list is a `listbox`; left/right arrows step through the game.
- Every icon-only button has an `aria-label`.
- Engine progress announces via `aria-live="polite"`, throttled to once a
  second, not every depth.

---

## 9. Copy

Plain and factual. Chess terms are used correctly and unglossed — the user
plays chess.

- Sentence case for everything, including buttons ("Analyze game", not
  "Analyze Game").
- Say what happened, not how it feels: "You played Nxe5. Best was Bxf7+, worth
  1.8 pawns." Not "Ouch — you missed a big one!"
- No exclamation marks, no encouragement, no gamification language.
- Numbers get units: "1.8 pawns", "depth 22", "38 games". Bare centipawn
  integers only inside mono columns where the header supplies the unit.

---

## 10. Do / don't

**Do** — flat fills; 1px `--edge` hairlines to separate; whitespace instead of
boxes; juniper for what the user does and sky for what the machine reports;
mono for every scannable number; let the board be the largest thing on screen.

**Don't** — gradients (except the check radial and the eval bar's hard split);
glass/blur; more than one shadow depth per view; colored panel backgrounds
beyond `--sand`; a second display font; textured or photographic board squares;
rounded pill buttons; outlined black pieces; interior detail or shading on a
piece; emoji; icon-only controls without labels; centered body copy; pie
charts.
