@AGENTS.md

# Chess Training App

Pulls a user's chess.com game history, analyzes games with a local Stockfish
engine, and helps the user drill positions where they made mistakes.

Stack: Next.js (App Router) + TypeScript. Stockfish is invoked as a local
native UCI engine process from the backend.

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
6. **Training/replay mode** — surface a flagged position, let the user
   replay it against Stockfish from that point, track whether they find
   the better move this time.
7. **Progress tracking / weak-spot dashboard** — aggregate mistakes over
   time (by opening, phase of game, motif) to show patterns and
   improvement.

## Possible future addition: Lichess puzzle database

Not yet decided/scheduled. Chess.com's API only exposes a given player's own
games — no general puzzle or master-game datasets. If we want training
exercises beyond the user's own flagged mistakes, Lichess publishes an open
puzzle database (public file dump at `database.lichess.org`, no auth
needed — millions of tactics with FEN, solution moves, rating, and themes
like fork/pin/endgame). Would set up a Lichess API connection only if/when
we decide we need this.
