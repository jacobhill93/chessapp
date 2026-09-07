"use client";

import { useState } from "react";
import type { ChessComGame } from "@/lib/chesscom";
import styles from "./page.module.css";

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
              {games.map((game) => {
                const date = new Date(game.end_time * 1000).toLocaleDateString();
                return (
                  <li key={game.uuid}>
                    {date} — {game.white.username} ({game.white.rating}) vs{" "}
                    {game.black.username} ({game.black.rating}) —{" "}
                    {game.time_class} — {game.pgn.match(/\[Result "(.*?)"\]/)?.[1]}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </main>
    </div>
  );
}
