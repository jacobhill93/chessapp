"use client";

import { useState } from "react";
import type { ChessComGame } from "@/lib/chesscom";
import type { ParsedGame, ParsedMove } from "@/lib/gameParser";
import type { EngineEvaluation } from "@/lib/stockfish";
import styles from "./page.module.css";

function formatClock(seconds: number | null): string {
  if (seconds === null) return "";
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(1);
  return `${m}:${s.padStart(4, "0")}`;
}

function formatScore(score: EngineEvaluation["score"]): string {
  if (!score) return "?";
  if (score.type === "mate") return `${score.favors === "b" ? "-" : ""}M${score.value}`;
  return (score.value / 100).toFixed(2);
}

function MoveItem({ move }: { move: ParsedMove }) {
  const [evaluation, setEvaluation] = useState<EngineEvaluation | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  async function evaluate() {
    setStatus("loading");

    try {
      const res = await fetch(
        `/api/evaluate?fen=${encodeURIComponent(move.fenAfter)}`,
      );
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Failed to evaluate position");
      }

      setEvaluation(data);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }

  return (
    <li style={{ listStyle: "none" }}>
      {move.color === "w" ? `${move.moveNumber}.` : ""}
      {move.san}
      {move.clockSeconds !== null && ` (${formatClock(move.clockSeconds)})`}{" "}
      {evaluation ? (
        <span>
          [{formatScore(evaluation.score)}, best {evaluation.bestMove}]
        </span>
      ) : (
        <button onClick={evaluate} disabled={status === "loading"}>
          {status === "loading" ? "..." : status === "error" ? "retry eval" : "eval"}
        </button>
      )}
    </li>
  );
}

function GameRow({ username, game }: { username: string; game: ChessComGame }) {
  const [parsed, setParsed] = useState<ParsedGame | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function toggleMoves() {
    if (parsed) {
      setParsed(null);
      return;
    }

    setStatus("loading");
    setError(null);

    try {
      const res = await fetch(
        `/api/positions?username=${encodeURIComponent(username)}&uuid=${encodeURIComponent(game.uuid)}`,
      );
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Failed to parse game");
      }

      setParsed(data);
      setStatus("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse game");
      setStatus("error");
    }
  }

  const date = new Date(game.end_time * 1000).toLocaleDateString();
  const result = game.pgn.match(/\[Result "(.*?)"\]/)?.[1];

  return (
    <li>
      {date} — {game.white.username} ({game.white.rating}) vs{" "}
      {game.black.username} ({game.black.rating}) — {game.time_class} —{" "}
      {result}{" "}
      <button onClick={toggleMoves} disabled={status === "loading"}>
        {parsed ? "Hide moves" : status === "loading" ? "Parsing..." : "View moves"}
      </button>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      {parsed && (
        <ol style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          {parsed.moves.map((move) => (
            <MoveItem key={move.ply} move={move} />
          ))}
        </ol>
      )}
    </li>
  );
}

export default function Home() {
  const [username, setUsername] = useState("jph093");
  const [games, setGames] = useState<ChessComGame[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function fetchGames() {
    setStatus("loading");
    setError(null);

    try {
      const res = await fetch(
        `/api/games?username=${encodeURIComponent(username)}`,
      );
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Failed to fetch games");
      }

      setGames(data.games);
      setStatus("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch games");
      setStatus("error");
    }
  }

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <h1>Chess Training</h1>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            fetchGames();
          }}
          style={{ display: "flex", gap: "0.5rem" }}
        >
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="chess.com username"
          />
          <button type="submit" disabled={status === "loading"}>
            {status === "loading" ? "Fetching..." : "Fetch games"}
          </button>
        </form>

        {error && <p style={{ color: "crimson" }}>{error}</p>}

        {games.length > 0 && (
          <>
            <p>{games.length} games</p>
            <ul style={{ width: "100%" }}>
              {games.map((game) => (
                <GameRow key={game.uuid} username={username} game={game} />
              ))}
            </ul>
          </>
        )}
      </main>
    </div>
  );
}
