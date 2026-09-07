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
2. **Chess.com data ingestion** — IN PROGRESS, blocked (see below).
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
   - **Blocker hit**: this session's environment network policy denied
     egress to `api.chess.com` at the proxy's CONNECT step (confirmed via
     `curl -sS "$HTTPS_PROXY/__agentproxy/status"` showing
     `connect_rejected` / org policy denial — chess.com itself never saw
     the request). The user updated the environment's network policy to
     allow all domains, but the change did not take effect in the
     already-running container (same uptime, same proxy allowlist
     before/after). Network policy appears to apply at container
     provisioning time, so it needs a **new session** (fresh container) to
     pick up the updated policy.
   - **Next step when resuming in a new session**: first sanity-check
     with `curl -s -A "ChessTrainingApp/0.1 (contact: jph093@gmail.com)"
     "https://api.chess.com/pub/player/jph093/games/archives"` to confirm
     egress now works. Once confirmed, build:
     - `src/lib/chesscom.ts` — typed client: list archives, fetch a
       month's games (PGN + metadata).
     - An API route (e.g. `src/app/api/games/route.ts`) that fetches games
       for a username and returns them.
     - Local persistence under a gitignored `data/` directory so games
       aren't re-fetched every time.
     - A minimal page to trigger a fetch and list the games.
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
