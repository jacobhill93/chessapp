@AGENTS.md

# Chess Training App

Pulls a user's chess.com game history via the chess.com MCP server, analyzes
games with a local Stockfish engine, and helps the user drill positions where
they made mistakes.

Stack: Next.js (App Router) + TypeScript. Stockfish is invoked as a local
native UCI engine process from the backend.
