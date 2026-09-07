@AGENTS.md

# Chess Training App

Pulls a user's chess.com game history, analyzes games with a local Stockfish
engine, and helps the user drill positions where they made mistakes.

Stack: Next.js (App Router) + TypeScript. Stockfish is invoked as a local
native UCI engine process from the backend.

UI work should follow `DESIGN.md` (repo root) — a normative design spec
("high desert" aesthetic: juniper green on bone/sand, dusty sky blue for
engine output, Archivo + IBM Plex Mono, flat Staunton pieces, no
gradients/glass/emoji) covering tokens, layout, the board, every
component, motion, accessibility, and copy tone. Read it before writing
any component or CSS — it was authored on `claude/chess-training-
stockfish-0yn0tt` and merged into this branch.

## Plan (work through with the user one stage at a time)

1. **Project scaffolding** — DONE. Next.js + TS app created via
   create-next-app, builds cleanly, pushed on
   `claude/chess-training-stockfish-0yn0tt`.
2. **Chess.com data ingestion** — DONE, pushed on
   `claude/chess-com-api-j9dxyc`.
   - Decision: hit chess.com's public REST API directly
     (`https://api.chess.com/pub/player/{username}/games/{yyyy}/{mm}`,
     archives list at `.../games/archives`), rather than depending on a
     third-party chess.com MCP server. Any such MCP server would just be a
     wrapper around this same API, so going direct is simpler and more
     future-proof. An MCP layer can be added later on top of our own
     backend/stored data if we want LLM tool access, as a separate optional
     piece — not a dependency for the core app.
   - Test username for development: `jph093` (chess.com username).
   - Use a descriptive User-Agent header on requests, e.g.
     `ChessTrainingApp/0.1 (contact: jph093@gmail.com)` — chess.com asks for
     this.
   - Built: `src/lib/chesscom.ts` (typed client: archives + per-month
     games), `src/lib/gameStore.ts` (disk cache under gitignored
     `data/games/{username}/{yyyy}-{mm}.json` — every month except the
     current in-progress one is immutable on chess.com's side, so those
     are cached and never re-fetched), `src/app/api/games/route.ts`
     (`GET /api/games?username=...`), and a minimal fetch-and-list UI on
     `src/app/page.tsx`. Verified end-to-end against `jph093` (4060 real
     games) including a screenshot of the rendered page.
   - **Environment network notes for future sessions in this environment**:
     - The environment's network egress policy must be set to allow the
       needed domain(s) (e.g. `api.chess.com`) — this is an **environment**
       setting (on code.claude.com/claude.ai, tied to the environment used
       to create the session), not a `File → Settings` app preference, not
       an env var, and unrelated to the local machine's own network/admin
       state. It also only takes effect in a **new** container — an
       already-running session won't pick up a change made after it
       started.
     - Separately, **Node's built-in `fetch` (undici) does not honor
       `HTTPS_PROXY`/`HTTP_PROXY` env vars by default**, even though `curl`
       does. In this sandboxed environment, outbound traffic goes through
       an agent proxy exposed via `HTTPS_PROXY`; without opting in, Node's
       `fetch` bypasses it and hits a separate, stricter transparent
       egress filter directly (returns a `403` with a
       "Host not in allowlist" body). Fix: run Node with
       `NODE_USE_ENV_PROXY=1` (Node 22's experimental env-proxy support),
       which makes `fetch` route through `HTTPS_PROXY` like `curl` does.
       This is now baked into the `dev` and `start` npm scripts in
       `package.json` — harmless in environments with no proxy configured
       (e.g. real deployment), required here for any Node code (API
       routes, scripts) that calls external APIs during development.
     - Once routed through `HTTPS_PROXY`, a second, separate issue can
       surface: `fetch failed` / `unable to get local issuer certificate`
       (Node error code `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`). This
       sandboxed environment's proxy re-terminates TLS (it presents its
       own certificate for the real destination host), signed by a local
       CA at `/root/.ccr/ca-bundle.crt` — Node's `fetch` doesn't trust
       that CA by default, even though the container's shell environment
       usually does (via `/etc/profile.d`), so a Node process started
       outside that inherited environment can still fail. Fix: also set
       `NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt`. Also baked into the
       `dev`/`start` npm scripts alongside `NODE_USE_ENV_PROXY=1` —
       verified harmless when the path doesn't exist (Node silently
       ignores a missing `NODE_EXTRA_CA_CERTS` file rather than erroring),
       so this is safe on a real machine (e.g. the developer's own
       Windows/Mac laptop) where that path is simply absent.
3. **Game parsing & storage model** — DONE, pushed on
   `claude/chess-com-api-j9dxyc`.
   - Uses `chess.js` (v1) to replay each game's PGN; its verbose move
     history already returns `before`/`after` FEN per move, so no need to
     hand-roll board/move logic. Clock times (chess.com's `{[%clk h:mm:ss]}`
     comments) are extracted separately via regex, in move order, and
     zipped with the verbose move list by index — more robust than
     chess.js's FEN-keyed comment lookup, which could misattribute on a
     repeated position within a game.
   - Built: `src/lib/gameParser.ts` (`parsePgn`/`parseGame` — a game's PGN
     to a `ParsedGame` with per-ply `san`/`from`/`to`/`fenBefore`/
     `fenAfter`/`clockSeconds`), `src/lib/positionStore.ts` (disk cache
     under gitignored `data/positions/{username}/{uuid}.json`, keyed by
     game uuid — parsing is cheap but games are immutable once played, so
     no need to ever re-parse), and `src/app/api/positions/route.ts`
     (`GET /api/positions?username=...&uuid=...`, looks the game up via
     the existing `gameStore` cache then parses/caches it).
   - UI: each game row in `src/app/page.tsx` has a "View moves" toggle
     that fetches and renders the parsed move list with clock times.
     Verified against a real 68-move game for `jph093`.
   - Scope note: parses one game at a time, on demand — no bulk/batch
     parsing across all of a user's games yet. That wasn't needed for this
     stage and the plan defers bulk analysis to mistake detection (stage
     5), by which point Stockfish (stage 4) is also in place.
4. **Stockfish integration** — DONE, pushed on `claude/chess-com-api-j9dxyc`.
   - Installed via `apt-get install stockfish` (Stockfish 16, Ubuntu
     noble's `universe` repo). Binary lands at `/usr/games/stockfish`,
     **not** on `PATH` by default in a plain shell — the app hardcodes
     that path (overridable via `STOCKFISH_PATH` env var). This is a
     system package, not a project dependency, so **any new
     container/environment needs `apt-get install stockfish` (or
     `STOCKFISH_PATH` pointed at another binary) before evaluation will
     work** — it won't fail loudly at build time, only when
     `/api/evaluate` is called and the spawn fails.
   - Built `src/lib/stockfish.ts`: `evaluatePosition(fen, { depth? |
     movetimeMs? })` spawns one Stockfish process per call over UCI
     (`uci` → `isready` → `position fen ...` → `go depth N` or
     `go movetime N`), parses the `info depth ... score cp/mate ... pv
     ...` lines as they stream, and resolves on `bestmove`. Score is
     normalized to **White's perspective** (Stockfish reports from the
     side-to-move's perspective; we flip the sign when it's Black to
     move) so scores are directly comparable across positions regardless
     of whose turn it is — this matters for stage 5's move-by-move
     centipawn-loss diffing.
   - Gotcha hit during development: piping `go depth N` immediately
     followed by `quit` to the engine's stdin (e.g. via a single
     `printf ... | stockfish` with no delay) can make it quit before the
     search finishes/flushes, silently dropping all `info` output. The
     wrapper avoids this by only killing/quitting the process after
     seeing the `bestmove` line on stdout, never on a timer or eagerly.
   - Added `GET /api/evaluate?fen=...&depth=...` (depth optional, else
     500ms movetime) and an "eval" button per move in the UI's move list
     (`src/app/page.tsx`), fetching evaluation for that move's `fenAfter`
     on click. Verified against real positions in the browser (e.g.
     `1.e4` → `+0.24, best c7c5`).
   - Scope note: one process per evaluation call, not a pooled/long-lived
     engine — fine for interactive single-position lookups from the UI,
     but stage 5's batch analysis (evaluating every position of every
     game) should reuse a single long-lived process instead of paying
     process-spawn overhead per position.
5. **Mistake detection** — DONE (backend only — see note below), pushed
   on `claude/chess-com-api-j9dxyc`.
   - `src/lib/stockfish.ts` gained a `StockfishSession` class: one
     long-lived engine process reused across many `evaluate()` calls
     (`uci`/`isready` handshake once, then repeated `position fen ... / go
     ...` round trips), replacing per-position process spawning for batch
     work. `evaluatePosition()` (the single-shot function stage 4 added)
     is now a thin wrapper around a one-off `StockfishSession` — same
     behavior/signature, `/api/evaluate` unaffected. Only one `evaluate()`
     call may be in flight per session at a time (fine — analysis is
     inherently sequential, one move after another).
   - `src/lib/analysis.ts`: `analyzeGame(parsedGame, { depth })` walks a
     game's moves with one `StockfishSession`, evaluating the starting
     position plus the result of each move — **N+1 engine calls for N
     moves, not 2N**, since a move's "before" position is exactly the
     previous move's "after" position (verified: consecutive
     `evalAfter`/`evalBefore` pairs are identical in the tested output).
     Per move, computes `centipawnLoss` (mover's-perspective eval drop
     from the position before to the position after, clamped at 0),
     buckets it into `classification` (best ≤10cp, good ≤50, inaccuracy
     ≤100, mistake ≤200, else blunder — arbitrary but standard-ish
     thresholds), tags a `phase` (opening = first 10 full moves;
     otherwise endgame if ≤6 non-pawn/king pieces remain on the board,
     else middlegame — a simple material-count heuristic, not a "real"
     phase detector), and flags `playedBestMove` (actual move vs. the
     engine's top choice, compared in UCI notation). Mate scores are
     saturated to a large centipawn-equivalent (`100000 - movesToMate`)
     so they diff sensibly against plain cp scores without special-casing
     downstream.
   - Verified against real games: a normal 17-ply game (values chain
     correctly move-to-move, flagged inaccuracies match known
     theory-inferior moves), a 0-move game (resignation before any move —
     handled gracefully, empty `moves: []`, not a crash), and a real
     Scholar's Mate (1.e4 e5 2.Qh5 Nc6 3.Bc4 Nf6?? 4.Qxf7#) — `Nf6` is
     correctly flagged a huge blunder (walked into mate-in-1) and
     `Qxf7#` is correctly `playedBestMove: true`.
   - `src/lib/analysisStore.ts` + `GET /api/analysis?username=...&uuid=
     ...&depth=...` cache to disk per `(username, uuid, depth)` under
     gitignored `data/analysis/` — a re-analysis at a different depth is
     intentionally a cache miss, since it isn't equivalent to a shallower
     one. Default depth is 12 (`DEFAULT_ANALYSIS_DEPTH` in
     `analysis.ts`); a 17-ply game analyzes in ~2s at that depth on this
     machine, cached reads are ~0.5s.
   - **No UI changes in this stage** — user is authoring a separate UI
     design doc, so stage 5 stayed API/backend-only
     (`analysis.ts`/`analysisStore.ts`/`api/analysis/route.ts`); wiring
     this into the UI is follow-up work once that design lands.
   - Scope note: tactic-motif classification (fork/pin/skewer/etc.) from
     the plan's "etc." isn't implemented — it needs real board/attack
     analysis, not just an eval diff, and felt like a separate, bigger
     feature rather than part of a first mistake-detection pass. Revisit
     later if wanted.
6. **Training/replay mode** — DONE (backend only), pushed on
   `claude/chess-com-api-j9dxyc`.
   - Bug found & fixed while building this stage:
     `EngineScore` for `type: "mate"` used to store a **signed** value
     (positive = good for White) to encode direction. That breaks for the
     specific case of a position that is *already checkmate* — Stockfish
     reports `score mate 0` there (verified directly over UCI), and `0`
     has no sign that survives `-0 === 0` in JS, let alone a JSON
     round-trip (`JSON.stringify(-0)` → `"0"`). Every decisive
     (checkmate-ending) game hits this on its final move, so it wasn't a
     hypothetical — it showed up immediately when analyzing a real
     Scholar's Mate game (the mating move `Qxf7#` was wrongly scored as a
     200000cp "blunder" instead of `centipawnLoss: 0, classification:
     "best"`). Fixed by changing `EngineScore` to store mate scores as an
     **unsigned** `value` (moves to mate, ≥ 0) plus a separate `favors:
     "w" | "b"` field, in `src/lib/stockfish.ts`. Updated the one other
     consumer of the old signed convention, `analysis.ts`'s
     `scoreToCentipawns`, and the existing UI's `formatScore` in
     `src/app/page.tsx` (a mechanical fix to keep already-shipped display
     code correct under the new type — not new UI work). Re-verified the
     Scholar's Mate game analyzes correctly after the fix.
   - `src/lib/mistakes.ts`: `getMistakesForUser(username, { minSeverity })`
     lists flagged moves purely by scanning **already-cached**
     `data/analysis/{username}/*.json` files (preferring the deepest
     analysis per game if more than one depth was cached) — it never
     triggers new Stockfish analysis itself. Analyzing a user's entire
     multi-thousand-game history on demand isn't feasible synchronously
     (see stage 5's depth/timing numbers); that's future work (a
     background bulk-analysis job), not something stage 6 needed to
     solve. `GET /api/mistakes?username=...&minSeverity=mistake|blunder|
     ...` exposes this.
   - `src/lib/drill.ts`: `attemptMove({ username, uuid, ply, from, to,
     promotion?, depth? })` replays a flagged mistake — loads the
     position before the original move (`fenBefore`, already stored on
     each `MoveAnalysis` since stage 5's fenBefore/fenAfter addition),
     validates the candidate move's legality with `chess.js` (which
     *throws* on an illegal move in v1, not returns `null` — confirmed
     directly), evaluates the result at the same depth as the original
     analysis for a fair comparison, and computes the same
     `centipawnLoss`/`classification` as the original analysis, plus
     `foundBestMove` (matched the engine's top choice) and `improved`
     (better than the original mistake). Every attempt — success or
     not — is appended to a per-position history file under gitignored
     `data/drills/{username}/{uuid}-ply{ply}.json`; an illegal move is
     rejected with 400 and never recorded. `POST /api/drill/attempt` and
     `GET /api/drill/history?username=...&uuid=...&ply=...` expose this.
   - Verified end-to-end: found the engine's best move (`improved: true`,
     `foundBestMove: true`), repeated the original blunder (`improved:
     false`, identical centipawn loss to the original), and an illegal
     move (400, not persisted to history) — all against the Scholar's
     Mate game's `Nf6??` blunder.
   - **No UI changes in this stage either**, same reasoning as stage 5.
7. **Weak-spot tally by motif** — DONE (backend only), pushed on
   `claude/chess-com-api-j9dxyc`. Descoped from the original plan's
   "progress tracking / weak-spot dashboard" per user direction: a simple
   tally by named motif, not a time-series trend tracker.
   - `src/lib/motif.ts`: `classifyMotif(move, nextMove)` tags a flagged
     move with one of four cheap heuristic categories — deliberately
     simple pattern-matching on data already computed, not real tactic
     recognition (no fork/pin/skewer detection):
     - `missed_mate` — mover had a forced mate available (`evalBefore`)
       and didn't keep it.
     - `walked_into_mate` — the move let the opponent force mate when
       that wasn't already the case.
     - `hung_material` — approximation: the very next move in the game
       (already-computed `bestMove` of the following `MoveAnalysis`,
       i.e. the engine's top reply right after the mistake) targets a
       square where one of the mover's own pieces worth ≥300cp (knight
       or greater) now sits. This is a coarse proxy, not a real
       exchange evaluation — it can flag an even trade, and won't catch
       material lost a few moves later — but it's cheap (`chess.js`
       only, zero extra Stockfish calls) and matched real blunders well
       in testing (e.g. a queen and a knight both correctly flagged
       across two different real games).
     - `positional` — catch-all fallback for anything not matching the
       above.
   - `src/lib/mistakes.ts`'s `getMistakesForUser` now attaches `motif` to
     each returned mistake (computed using the full per-game move array
     so `nextMove` lookups work, before filtering down to just the
     flagged ones).
   - `src/lib/weakSpots.ts`: `getWeakSpotSummary(username, { minSeverity })`
     groups a user's already-cached flagged mistakes by motif and tallies
     `count`, `avgCentipawnLoss`, `drilledCount` (has ≥1 recorded drill
     attempt — see stage 6), and `resolvedCount` (most recent attempt
     came back `best`/`good`). Computes each mistake's drill status
     concurrently first, then aggregates in a plain synchronous loop —
     aggregating inside the concurrent map itself would race, since two
     mistakes sharing a motif could both read the same not-yet-inserted
     tally before either writes it back and silently drop one update.
     `GET /api/weak-spots?username=...&minSeverity=...` exposes this.
   - Verified against real games: `walked_into_mate` and `missed_mate`
     correctly identified via mate-score transitions (including a real
     missed mate-in-2, where the player captured a pawn with check
     instead of the mating move and the eval dropped from forced mate to
     "only" +9.59), and `hung_material` correctly flagged on two separate
     real blunders (a hung queen, a hung knight).
   - **No UI changes in this stage either**, same reasoning as stages 5–6.
   - Scope note: real tactic-pattern recognition (actual fork/pin/skewer
     detection via attack-line analysis) was considered and explicitly
     declined in favor of these cheaper heuristics — revisit if the
     coarser categories turn out not to be useful enough in practice.

8. **UI implementation** — IN PROGRESS, on branch `claude/ui-implementation`
   (branched off `claude/chess-com-api-j9dxyc` once it had `DESIGN.md`
   merged in). Kept on its own branch, separate from the backend-work
   branch, per user preference — architecturally `src/lib` (backend) vs
   `src/app` (UI/routes) was already separated regardless, but a dedicated
   branch makes this stage easy to review/rollback independently before
   merging back. Working through `DESIGN.md` one slice at a time rather
   than all at once, same "one stage at a time" approach as the backend
   plan above.
   - **Global elements — DONE.**
     - `src/app/layout.tsx`: replaced the scaffold's Geist fonts with
       `DESIGN.md`'s Archivo (variable font, `wdth` axis) + IBM Plex Mono
       via `next/font/google`, loaded into `--font-sans-src`/
       `--font-mono-src` CSS variables. Updated the leftover
       create-next-app `metadata` (title/description) to the actual app.
     - `src/app/globals.css`: replaced entirely with `DESIGN.md`'s token
       block (`--bone`/`--sand`/`--ink`/juniper/sky/rust/ocher/board
       tokens, spacing, radius, elevation) plus a base reset. `--font-sans`/
       `--font-mono` reference the `next/font`-generated `*-src` variables
       (with their auto-generated fallback-metrics font) rather than the
       literal `"Archivo"` string `DESIGN.md`'s snippet shows standalone —
       needed to actually wire `next/font`'s self-hosted loading into the
       token system as the doc's own stack-context section intends.
     - Implemented light/dark per `DESIGN.md`: base `:root` is light,
       `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"])
       {...} }` is the "auto" default, and `:root[data-theme="dark"]` is
       the manual-override block — so a future toggle setting `data-theme`
       wins in both directions over system preference. Only the CSS side
       of the manual override is built; there's no toggle control or
       localStorage read/write yet since no component needs it yet (the
       doc doesn't spec a toggle's location/appearance) — add that
       plumbing when a real settings/nav component calls for it, rather
       than wiring dead infrastructure now.
     - Installed `lucide-react` (the icon library `DESIGN.md` section 6
       names) as a dependency now, even though no component uses it yet —
       a foundational/global choice, not per-component work.
     - Minimal courtesy fix, not a redesign: `page.module.css`'s two
       `var(--font-geist-*)` references (now-dangling since Geist was
       removed) were repointed at `--font-sans`/`--font-mono` so the
       still-unmigrated existing page doesn't lose its font entirely
       before its own rebuild stage. Its layout/colors are untouched
       (still the old scaffold's local hardcoded tokens) — confirmed via
       screenshot that body background/text now follow the new global
       tokens correctly in both light and dark, while the old page's own
       `.page`/`.main` surface colors are intentionally still the
       pre-existing scaffold ones, pending the next stage.
   - **The board — DONE.** `src/app/board/`:
     - `pieces.tsx`: flat, single-shape Staunton piece silhouettes per
       `DESIGN.md` section 4. Sourced the real Cburnett SVG set from
       Wikimedia Commons (`https://commons.wikimedia.org/wiki/Special:FilePath/Chess_*lt45.svg`,
       CC BY-SA 3.0 / GFDL — licensing recorded in a comment at the top of
       `pieces.tsx` per the doc's explicit "record the choice in the
       repo" instruction) rather than hand-drawing a stand-in set, since
       network access made this achievable. Flattening required real
       vector tooling, not manual path edits: for each piece, hand-removed
       the *decorative* interior stroke-only paths (crown creases,
       bishop's mitre cross, rook's under-crenellation line, knight's eye
       dots) while keeping *structural* stroke-only shapes (the king's
       cross — without it the king isn't recognizable), then rasterized
       the result at 600×600 (`rsvg-convert`) and re-traced it into one
       closed silhouette path per piece (`potrace`, installed via apt
       alongside `imagemagick` for the alpha-mask threshold step). Hit and
       fixed a mask-polarity bug along the way: the first pass traced the
       *background* instead of the piece (verified by rendering a contact
       sheet of all 6 pieces before trusting the output) — fixed with
       potrace's `--invert` flag. Final contact-sheet check confirmed all
       6 pieces read correctly as flat silhouettes before wiring them in.
     - `Board.tsx`/`.module.css`: renders from a FEN (via `chess.js`) —
       correct square coloring (a1 dark), coordinates drawn inside the
       edge squares at the spec'd opposite-square-color/55%-opacity, last-
       move highlight, a check radial gradient, pieces at 86% of the
       square, and an SVG-overlay best-move hint arrow. Read-only/
       controlled by a `fen` prop — no drag-and-drop or move-making yet
       (see scope note below).
     - Scope trims from the full section-4 spec, deliberate: no drag-and-
       drop or click-to-move interaction (the board is a position viewer,
       driven by clicking moves in the move list — actually *making* a
       move belongs to stage 6's drill flow, which has no UI yet either);
       no JS-based "snap board size to a multiple of 8" pixel-alignment
       (approximated with CSS `aspect-ratio: 1` instead); no premove/
       hover/drag visual states (nothing to preview yet without
       interaction); only the juniper best-move arrow is implemented, not
       the separate rust "blunder marker" arrow (the move list's blunder
       glyph plus the ocher last-move highlight already cover that
       signal, and the blunder arrow's exact intended meaning wasn't
       fully unambiguous from the spec alone).
   - **Game review screen — DONE.** `src/app/games/[uuid]/page.tsx`
     (client component, `uuid` from the route + `username` from a search
     param) wires the board together with:
     - `MoveList.tsx`/`.module.css`: two-column move grid, quality glyphs
       (`!`/`?!`/`?`/`??`) mapped from the existing 5-tier
       `MoveClassification` (best→`!`, good→no glyph, inaccuracy→`?!`,
       mistake→`?`, blunder→`??`, matching the spec's 4-glyph scheme),
       current-move highlighting, click-to-jump navigation.
     - `EvalBar.tsx`/`.module.css`: vertical bar with a standard
       cp-to-win-share sigmoid for the fill split, signed numeric readout,
       full flip (no animation) on mate scores.
     - Analysis is opt-in via an "Analyze this game" button rather than
       automatic on page load, since it's a real, potentially-slow
       Stockfish run across every move — never surprise-block on page
       open. While running, the copy honestly says "this can take a
       bit…" rather than the spec's ideal of real incremental depth/move
       progress, since that would need the backend analysis loop to
       stream progress (e.g. SSE) rather than return one blocking
       response — a real future improvement, not built in this pass.
     - Found and fixed a real layout bug during testing: the shell used
       `min-height: 100vh` instead of `height: 100vh`, so the move-list
       panel's `overflow-y: auto` never actually activated (nothing above
       it was height-*constrained*, so it just grew to fit all content
       instead of scrolling) — the whole page scrolled instead of just
       the move list. Fixed by making the shell's height fixed and
       threading `min-height: 0` through the flex chain down to the
       scrollable panel, then verified by scripting an actual scroll and
       screenshotting mid-scroll, not just checking the top of the page.
   - **Library page rebuild — DONE.** `src/app/GameCard.tsx`/`.module.css`
     + rewritten `src/app/page.tsx`/`.module.css`: Game card component per
     spec (opponent+rating, 3px left border colored by the *searched
     user's* outcome — win/draw/loss determined from chess.com's own
     per-side `result` field, not raw PGN `1-0`/`0-1`/`½-½` — time class,
     date, mistake count), the "front door" username input row (44px
     primary button), and loading/error/empty states (pulsing skeleton
     blocks, an inline retry block, a centered empty state). Each card
     links to `/games/{uuid}?username=...`, replacing the old inline
     "View moves"/eval-per-move feature from stages 3–4 (superseded by
     the review screen above). Mistake counts come from a best-effort
     client-side `GET /api/mistakes` call tallied by uuid — shows "—" for
     games that haven't been analyzed yet (no new analysis is triggered
     from the library view), a real count once a game has been opened and
     analyzed from the review screen.
   - Verified the whole flow end-to-end in a real browser, light and dark:
     search → card list → open a game → step through moves (buttons, move-
     list clicks, flip) → run analysis → see quality glyphs, eval bar, and
     the mistake count back-propagate onto the library card.
   - Known follow-ups, not done in this pass: the drill/replay UI (stage
     6 has the backend, no board interaction to attempt a move yet); the
     rust blunder-marker arrow; a real settings/nav surface to hang a
     light/dark toggle off of; streaming analysis progress; virtualizing
     the game list (a card is heavier DOM than the old plain `<li>`, and
     large accounts can have thousands of games — not yet a measured
     problem, just an unaddressed one).

## Possible future addition: Lichess puzzle database

Not yet decided/scheduled. Chess.com's API only exposes a given player's own
games — no general puzzle or master-game datasets. If we want training
exercises beyond the user's own flagged mistakes, Lichess publishes an open
puzzle database (public file dump at `database.lichess.org`, no auth
needed — millions of tactics with FEN, solution moves, rating, and themes
like fork/pin/endgame). Would set up a Lichess API connection only if/when
we decide we need this.
