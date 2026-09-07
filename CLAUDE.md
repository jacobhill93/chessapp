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
3. **Game parsing & storage model** — parse PGNs into structured
   positions/moves (FEN, move played, clock time, etc.) so individual
   positions can be queried later.
4. **Stockfish integration** — run a local Stockfish binary via UCI to
   evaluate positions: best move, eval score, centipawn loss per move.
5. **Mistake detection** — diff the user's actual moves against
   Stockfish's top choice per position, flag high-centipawn-loss/blunder
   moves, classify them (opening/middlegame/endgame, tactic type, etc.).
6. **Training/replay mode** — surface a flagged position, let the user
   replay it against Stockfish from that point, track whether they find
   the better move this time.
7. **Progress tracking / weak-spot dashboard** — aggregate mistakes over
   time (by opening, phase of game, motif) to show patterns and
   improvement.
