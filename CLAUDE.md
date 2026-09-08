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
       `NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt`.
       **Correction (found when a real user actually ran this on
       Windows):** this was originally baked directly into the `dev`/
       `start` npm scripts in `package.json`, on the assumption that Node
       silently ignores a missing `NODE_EXTRA_CA_CERTS` file — that
       assumption was wrong. On Windows, pointing `NODE_EXTRA_CA_CERTS`
       at a nonexistent path doesn't fall back gracefully; it broke TLS
       verification for *all* HTTPS requests (`UNABLE_TO_GET_ISSUER_CERT_LOCALLY`
       on chess.com fetches that have nothing to do with this sandbox).
       Fixed by removing it from `package.json` entirely and instead
       setting it from `.claude/hooks/session-start.sh` via
       `$CLAUDE_ENV_FILE`, gated on the cert file actually existing — so
       it's applied only inside this sandboxed environment and never
       ships to a real user's machine. `NODE_USE_ENV_PROXY=1` stays in
       `package.json` since it's a genuine no-op with no proxy configured
       (confirmed safe on the same Windows machine); it's the
       cert-path-shaped assumption that didn't hold, not the proxy one.
     - **A third, unrelated TLS issue surfaced on that same Windows
       machine after the fix above**: `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`
       persisted on plain chess.com fetches even with the sandbox's cert
       hack fully removed — this one had nothing to do with our sandbox
       at all. Real-world cause: something on the user's own Windows
       machine (antivirus with HTTPS/SSL scanning, or a corporate/VPN
       proxy — very common) intercepts TLS and presents a certificate
       signed by a locally-installed root CA; Windows and browsers trust
       it via the OS certificate store, but Node's `fetch` doesn't
       consult that store by default. Fix: Node 22's `--use-system-ca`
       flag, which makes Node also trust the OS trust store. Confirmed
       working on the affected machine, then baked into `package.json`'s
       `dev`/`start` scripts (`NODE_OPTIONS=--use-system-ca`, via
       `cross-env`) since this is a genuinely common class of local
       Windows setup, not sandbox-specific — added an `engines.node
       ">=22"` field alongside it since the flag doesn't exist on older
       Node.
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

   - **"Great move" tier — DONE**, added after the initial UI pass, per
     user request to mirror chess.com's distinction between an ordinary
     best move and a "Great move" (the correct move in a critical spot
     where anything else would have swung the game hard).
     - `src/lib/stockfish.ts`: `StockfishSession.evaluate()` gained a
       `multiPv` option. Requesting `multiPv: 2` makes Stockfish report
       two ranked lines (`info ... multipv 1 ...` / `multipv 2 ...`)
       instead of one; `EngineEvaluation` gained `secondBestScore` (the
       second line's score) alongside the existing top-line `score`.
       Internally this needed real restructuring, not just a new field:
       the single `lastScore`/`lastPv`/`lastDepth` accumulators on a
       pending evaluation became a `Map<multipvIndex, PvSlot>`, since
       lines for both ranks interleave as depth increases and the old
       code would've just let rank 2's lines clobber rank 1's. Verified
       against raw UCI output before trusting it (`multipv N` tokens
       parse exactly as expected; Stockfish's default `MultiPV` UCI
       option is 1, so this is opt-in and free for every other caller —
       `/api/evaluate` and the drill flow's single-shot `evaluatePosition`
       are unaffected).
     - `src/lib/analysis.ts`: `analyzeGame` now requests `multiPv: 2` for
       every evaluation (each position already serves double duty as one
       move's "after" and the next move's "before" — see the N+1 note
       above — so there's no cheaper way to get this for only "before"
       positions). Added `criticalityGap` to `MoveAnalysis` (mover's-
       perspective centipawn gap between the best and second-best line;
       null when there's no real alternative, e.g. only one legal move).
       A "best"-classified move (≤10cp loss) upgrades to a new `"great"`
       classification when that gap is ≥150cp (`GREAT_MOVE_GAP_CP`).
       Added `"great"` to `MoveClassification` and
       `CLASSIFICATION_SEVERITY_ORDER` (least severe, ahead of `"best"` —
       doesn't affect `mistakes.ts`/`weakSpots.ts` filtering, since both
       already default to `minSeverity: "mistake"`, well above this end
       of the scale).
     - Verified against real games: the Scholar's Mate's mating move
       (`Qxf7#`) and a separate game's 3-move forced-mate sequence
       (`Qxf7+`, `Nxe6+`) all correctly upgraded from `"best"` to
       `"great"`; a genuine "only move to avoid getting mated" (`Ke7`,
       evaluated at a merely-bad-but-not-lost cp score vs. a mate-losing
       alternative) also correctly flagged; ordinary solid moves in the
       same games stayed `"best"`.
     - UI: `MoveList.tsx` now renders `"best"` as a `lucide-react`
       `ThumbsUp` icon (matching `DESIGN.md` section 6's icon guidance)
       and keeps the `!` text glyph exclusively for `"great"`, so the two
       are visually distinct at a glance rather than both showing `!`.
       The hover tooltip on a `"great"` move states the avoided swing
       (e.g. "the only one avoiding a 291cp swing") instead of the plain
       centipawn-loss text other moves show.
   - **Three follow-up polish requests — DONE.**
     - `EvalBar` now takes a `flipped` prop and anchors White's fill to
       whichever end of the bar White's pieces actually sit at (bottom
       normally, top when the board is flipped), instead of always
       anchoring White's share to the bottom regardless of orientation.
     - The best-move hint arrow changed from `--jun-500` (green) to
       `--ocher-500` (a calm gold) per direct feedback — updated in both
       `Board.tsx` and `DESIGN.md`'s state-layer table so the doc stays
       accurate.
     - Added a glyph legend (`MoveGlyphLegend`, exported from
       `MoveList.tsx` so it reuses the exact same glyph-rendering logic
       rather than duplicating it) in its own panel section below the
       move list.

9. **Real tactical motif detection + unrelated-puzzle drilling** — IN
   PROGRESS, on branch `claude/ui-implementation`. Upgrades the coarse
   4-bucket motif heuristic from stage 7 (`missed_mate`/`walked_into_mate`/
   `hung_material`/`positional`) with real geometric tactic detection, and
   adds a second training mode: not just replaying your own flagged
   mistake (stage 6, already built), but drilling an *unrelated* puzzle
   that exhibits the same motif, pulled from Lichess's public puzzle
   database.

   **Decision: build motif detection natively in TypeScript, not as a
   Python subprocess.** Considered wrapping
   [chess-detect](https://github.com/aslyamov/chess_detect) (MIT,
   python-chess–based, does real per-move geometric tactic detection —
   fork/pin/skewer/discovered-check/etc., unlike
   [Chess-Tactic-Finder](https://github.com/JakimPL/Chess-Tactic-Finder),
   which only finds "puzzle-worthy" moments via the same eval-gap logic
   we already built for stage 8's "great move" feature, and whose own
   docs admit theme classification is unsolved) as a subprocess, same
   pattern as Stockfish. Rejected once the user raised multi-user hosting
   as a real future consideration: unlike Stockfish (a native binary with
   no alternative), Python is a second full language runtime the deploy
   image would need, and every concurrent "Analyze" click would spawn
   *two* subprocesses instead of one, doubling whatever
   pooling/queueing solution concurrent Stockfish usage will eventually
   need anyway. Porting the relevant detectors to native TS runs in the
   same Node process — zero added subprocess/deploy cost — at the price
   of real porting effort instead of a drop-in dependency. Using
   `chess-detect`'s source as an algorithm reference (not a dependency)
   during the port, including its README's example FEN per motif as a
   ready-made spot-check test set.

   **Motif coverage tracker** (update as detectors land — this table is
   the answer to "did we cover X yet" across context resets):

   | Motif | In `chess-detect`? | Ported to our TS? |
   | --- | --- | --- |
   | Fork | yes | **yes** — `src/lib/tactics/detectors/fork.ts` |
   | Pin | yes | **yes** — `src/lib/tactics/detectors/pin.ts` |
   | Skewer | yes | **yes** — `src/lib/tactics/detectors/skewer.ts` |
   | Discovered check | yes | **yes** — `src/lib/tactics/detectors/discoveredCheck.ts` |
   | Double check | yes | **yes** — `src/lib/tactics/detectors/doubleCheck.ts` |
   | Trapped piece | yes | not yet (not in Phase 1 scope) |
   | Hanging capture | yes | not yet (not in Phase 1 scope — overlaps our existing `hung_material` heuristic) |
   | Removing defender (material/mate) | yes | not yet (not in Phase 1 scope) |
   | Exploiting pin | yes | not yet (not in Phase 1 scope) |
   | Open file / doubled / isolated pawns | yes (strategic, not tactical) | not yet (not in Phase 1 scope) |
   | Back-rank mate | **no — not in chess-detect at all** | **yes** — `src/lib/tactics/detectors/backRank.ts`, built from scratch. Narrow on purpose: only flags a checkmate actually delivered by a rook/queen along the king's own back rank, not an unconverted back-rank *threat* (that needs searching for a threat that didn't happen — bigger feature, not done) |
   | Zugzwang | **no — not in chess-detect at all** | deferred indefinitely — no clean geometric signature, genuinely hard even for engines (needs null-move-style comparison); Lichess's own puzzle generator relies on human review, not pure automation, for exactly this class of judgment call |
   | Deflection, decoy, zwischenzug, general discovered attack, smothered mate | **no — on chess-detect's own "Planned" list, unimplemented upstream too** | not planned yet |

   **Phase 1 — DONE.** Built under `src/lib/tactics/`:
   - `context.ts`: `buildMoveContext(fenBefore, from, to, promotion)` — the
     TS equivalent of chess-detect's `MoveContext`. Loads `fenBefore` and
     (via a scratch `chess.js` instance with `.move()` applied) `fenAfter`
     directly rather than replaying, since every `ParsedMove` already
     carries both FENs — simpler than the Python original's board-copy-and-
     push approach and gets en passant/castling metadata for free from
     chess.js's `Move` object instead of hand-rolling it. `chess.js`'s
     `attackers(square, color)` turned out to be exactly python-chess's
     `board.attackers()` (raw attack pattern, not legal-move-filtered), so
     `squaresAttackedFrom()` (our `piece_attacks` equivalent) is built on
     top of it directly.
   - `rays.ts`: `castRay`/`squaresBetween`/`findRelativePin`/
     `isPieceVulnerable` — direct ports of chess-detect's `utils.py` ray
     utilities.
   - `detectors/{fork,pin,skewer,discoveredCheck,doubleCheck}.ts`: line-
     for-line ports of chess-detect's corresponding detector logic (see
     the Russian-commented source fetched from
     `github.com/aslyamov/chess_detect` for reference — comments in our
     versions are in English and explain the *why*, not a translation of
     the original comments). One naming note for Phase 2: our
     `discoveredCheck` only fires when the moved piece delivers a check
     that reveals *another* checking piece (chess-detect's own scope) —
     it does not cover a general "discovered attack" that doesn't involve
     check at all. **Update from Phase 3:** originally mapped this to
     Lichess's `discoveredAttack` theme, but Lichess actually has both a
     `discoveredAttack` theme (broad) *and* a separate `discoveredCheck`
     theme (narrow, check-only) — confirmed by scraping
     `lichess.org/training/themes`'s theme list during Phase 3. Our
     detector's scope matches their `discoveredCheck` exactly, so the
     exposed `Motif` value was corrected to `discoveredCheck` (not
     `discoveredAttack`) before Phase 3 shipped, so the puzzle lookup in
     Phase 4 doesn't need a translation layer here either.
   - `detectors/backRank.ts`: from-scratch back-rank mate detector (see
     tracker row above for exact scope).
   - `index.ts`: `detectTactics(fenBefore, from, to, promotion)` runs all
     six detectors and returns every hit (a move can match more than one,
     e.g. a discovered check that's also a fork).
   - Verified two ways: (1) hand-built FEN spot-checks for all six motifs
     (one per detector, plus a double-check-without-discovered-check
     negative case confirming chess-detect's stricter "moved piece must
     add independent value" rule for `discoveredCheck`) — all pass; (2) a
     crash-test sweep of `detectTactics` across every move of 11 real
     cached games (387 moves total, `data/positions/jph093/*.json`) — zero
     exceptions, 39 tactic hits found (20 pins, 15 forks, 4 skewers; no
     discovered/double checks or back-rank mates in this particular
     sample, which is plausible — they're rarer patterns). Not yet wired
     into `motif.ts`/the UI — that's Phase 2.

   **Phase 2 — DONE.** `src/lib/motif.ts` now calls the Phase 1 detectors
   instead of relying solely on the old 4-bucket heuristic:
   - `Motif` grew six new Lichess-named variants (`fork`, `pin`, `skewer`,
     `discoveredCheck`, `doubleCheck`, `backRankMate`) alongside the
     original `missed_mate`/`walked_into_mate`/`hung_material`/
     `positional` (see Phase 1's naming note above, updated during Phase
     3, on why `discoveredCheck` and not `discoveredAttack`).
   - `classifyMotif`'s precedence, in order: (1) the existing eval-based
     mate checks, unchanged; (2) **new** — run `detectTactics` on the
     *engine's recommended move* from the position before the mistake
     (`move.fenBefore` + `move.bestMove`) — this is "what tactic did the
     player miss," and conveniently is exactly the position/move stage
     6's drill mode already replays, so a `"fork"` tag now means "the
     move you should have played here was literally a fork"; (3) **new**
     — the same check against the *opponent's* likely reply
     (`nextMove.fenBefore` + `nextMove.bestMove`) — "what tactic did the
     mistake let the opponent execute," e.g. a mistake that got punished
     by a pin rather than a missed tactic of the player's own; (4) the
     original coarse `hung_material` proxy, now a fallback for plain
     undefended-piece losses that don't match any of the six named
     tactics; (5) `positional` catch-all, unchanged.
   - A move can match more than one detector (e.g. a discovered check
     that's also a fork); `TACTIC_PRIORITY` in `motif.ts` picks one,
     rarest/most specific first (`doubleCheck` > `backRankMate` >
     `discoveredCheck` > `skewer` > `pin` > `fork`).
   - Malformed/terminal bestMove strings (crossing the disk-cache
     boundary from old analysis runs) are handled defensively — a
     `detectTactics` throw during motif classification is caught and
     treated as "no tactic found," never a crash.
   - Verified against real cached analysis data (45 flagged moves across
     5 real games, `data/analysis/jph093/*.json`, no code changes to
     that data): ran cleanly with no exceptions, and spot-checked two
     results directly against the actual board position rather than
     trusting the label — a `"pin"` result on move 62513cc9 ply35 traced
     back to the opponent's best reply `Rc8`, which does genuinely pin
     White's bishop on c5 to the queen on c4 along the c-file; a
     `"fork"` result on move 14158213 ply18 traced back to the missed
     `Qg5`, which does attack two simultaneously-undefended white pawns
     (e3 and g2). Distribution across the 45 moves: 28 positional, 5
     hung_material, 5 pin, 3 walked_into_mate, 2 missed_mate, 1 fork, 1
     skewer — no discoveredCheck/doubleCheck/backRankMate hits in this
     particular sample (consistent with Phase 1's real-game sweep, where
     those three were also the rarest).
   - No UI changes in this pass either — `weak-spots`/`mistakes` API
     responses just carry richer motif values now; there's still no
     dedicated weak-spots UI to update (same "no UI yet" scope note as
     stages 5–7).

   **Phase 3 — DONE.** Ingested the Lichess public puzzle database
   (CC0, `database.lichess.org`) into a local SQLite index:
   - `scripts/ingestPuzzles.mjs`: downloads
     `lichess_db_puzzle.csv.zst` (~304MB compressed, 6.1M puzzles) to
     `data/lichess/` (gitignored, cached — reruns skip the download unless
     `--force`), then streams it through decompression → CSV parsing →
     SQLite insert without ever holding the ~1GB+ decompressed CSV in
     memory or on disk at once. Two library choices were deliberate, both
     to avoid repeating this project's earlier native-module Windows pain
     (the `NODE_EXTRA_CA_CERTS`/`--use-system-ca` saga in stage 2's notes):
     `fzstd` for decompression (pure JS, no native/WASM build step, 8kB) and
     `node:sqlite` (built into Node 22+, no extra dependency at all — this
     project already requires Node ≥22). Both are used read-only-safe and
     add zero native-compilation surface for a future Windows run of this
     script.
   - Schema: `puzzles` (id, fen, moves, rating, rating_deviation,
     popularity, nb_plays, themes, game_url, opening_tags) plus a
     normalized `puzzle_themes(puzzle_id, theme)` table for fast
     "puzzles with theme X" lookups — indexes on `puzzle_themes.theme`
     and `puzzles.rating` are built *after* the bulk insert (building them
     incrementally across ~30M theme rows during insert was far slower
     in testing).
     `puzzles.fen`/`moves` are stored exactly as Lichess provides them: per
     Lichess's own format, `moves[0]` is a "setup" move the viewer must
     play to reach the actual puzzle position, and the real solution
     starts at `moves[1]` — noted here for Phase 4, which will need to
     apply that setup move before handing the position to the user.
   - Full ingestion (all 6.1M rows) took ~2 minutes and produced a 2.8GB
     `data/puzzles/puzzles.db` (gitignored, like everything else under
     `data/` — never committed; anyone continuing this needs to run
     `npm run ingest:puzzles` once locally before Phase 4's puzzle
     features will work). `--limit N` on the script supports a fast
     smoke-test run without waiting on the full ingest.
   - `src/lib/puzzles.ts`: `findRandomPuzzleByTheme(theme, { minRating,
     maxRating, excludeIds })` — a plain read-only `node:sqlite` query,
     random pick after filtering by theme + rating band (confirmed safe:
     every one of our six tactic motifs has 30k-780k matching puzzles in
     the full database, so the `ORDER BY RANDOM()` only ever sorts a
     filtered subset, never all 6.1M rows). `isPuzzleDatabaseAvailable()`
     lets callers degrade gracefully before the DB has been ingested.
     Confirmed the Lichess theme vocabulary (scraped from
     `lichess.org/training/themes`) spells `fork`/`pin`/`skewer`/
     `discoveredCheck`/`doubleCheck`/`backRankMate` identically to our own
     `Motif` values — this is what caught and fixed the
     `discoveredAttack`-vs-`discoveredCheck` naming mismatch noted above.
   - `GET /api/puzzles?theme=fork[&minRating=][&maxRating=]` exposes this
     for manual testing ahead of Phase 4's real UI. Verified against the
     live dev server and the full 6.1M-row database: `fork`, `pin`, and
     `backRankMate` all returned real, correctly-shaped puzzles; a missing
     `theme` param 400s; a theme with no matches (or an unrecognized
     theme string) 404s.
   - No UI changes in this pass — same as Phases 1–2.

   **Planned phases** (Phases 1–3 done; 4 remains):
   1. ~~Native detectors for fork/pin/skewer/discovered check/double
      check (ported) + back-rank (built from scratch).~~ **DONE**.
   2. ~~Wire results into `motif.ts`.~~ **DONE** — see above.
   3. ~~Ingest the Lichess puzzle database.~~ **DONE** — see above.
   4. New training-mode UI sourcing a puzzle FEN from
      `findRandomPuzzleByTheme` instead of the user's own game (applying
      Lichess's "setup move" convention noted above), reusing stage 6's
      move-validation/attempt logic. **Next up.**
