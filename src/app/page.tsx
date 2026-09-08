"use client";

import { useState } from "react";
import type { ChessComGame } from "@/lib/chesscom";
import type { Mistake } from "@/lib/mistakes";
import { AppRail } from "./AppRail";
import { GameCard } from "./GameCard";
import styles from "./page.module.css";

export default function Home() {
  const [username, setUsername] = useState("jph093");
  const [games, setGames] = useState<ChessComGame[]>([]);
  const [mistakeCounts, setMistakeCounts] = useState<Map<string, number>>(new Map());
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  async function fetchGames() {
    setStatus("loading");
    setError(null);
    setHasSearched(true);

    try {
      const res = await fetch(`/api/games?username=${encodeURIComponent(username)}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Failed to fetch games");
      }

      setGames(data.games);
      setStatus("idle");

      // Best-effort: show mistake counts for whatever's already been
      // analyzed. Doesn't block the game list from rendering.
      fetch(`/api/mistakes?username=${encodeURIComponent(username)}`)
        .then((r) => r.json())
        .then((mistakesData: { mistakes?: Mistake[] }) => {
          if (!mistakesData.mistakes) return;
          const counts = new Map<string, number>();
          for (const mistake of mistakesData.mistakes) {
            counts.set(mistake.uuid, (counts.get(mistake.uuid) ?? 0) + 1);
          }
          setMistakeCounts(counts);
        })
        .catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch games");
      setStatus("error");
    }
  }

  return (
    <div className={styles.shell}>
      <AppRail username={username} />

      <main className={styles.main}>
        <div className={styles.center}>
          <h1 className={styles.title}>Game Library</h1>

          <form
            className={styles.searchRow}
            onSubmit={(e) => {
              e.preventDefault();
              fetchGames();
            }}
          >
            <div className={styles.field}>
              <label className={styles.label} htmlFor="username">
                Chess.com username
              </label>
              <input
                id="username"
                className={styles.input}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="jph093"
              />
            </div>
            <button type="submit" className={styles.primaryButton} disabled={status === "loading"}>
              {status === "loading" ? "Fetching…" : "Fetch games"}
            </button>
          </form>

          {status === "error" && (
            <div className={styles.errorBlock}>
              <p className={styles.errorHeading}>Couldn&apos;t load games</p>
              <p>{error}</p>
              <button className={styles.secondaryButton} onClick={fetchGames}>
                Retry
              </button>
            </div>
          )}

          {status === "loading" && (
            <div className={styles.skeletonList}>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className={styles.skeleton} />
              ))}
            </div>
          )}

          {status === "idle" && hasSearched && games.length === 0 && (
            <div className={styles.empty}>
              <p className={styles.emptyTitle}>No games found</p>
              <p className={styles.emptyHint}>Check the username and try again.</p>
            </div>
          )}

          {games.length > 0 && (
            <>
              <p className={styles.count}>{games.length} games</p>
              <div className={styles.list}>
                {games.map((game) => (
                  <GameCard
                    key={game.uuid}
                    game={game}
                    username={username}
                    mistakeCount={mistakeCounts.get(game.uuid) ?? null}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
