"use client";

import { useState } from "react";
import Link from "next/link";
import { AppRail } from "@/app/AppRail";
import type { MotifSummary } from "@/lib/weakSpots";
import styles from "./page.module.css";

/**
 * Motifs with a Lichess theme to source unrelated training puzzles from —
 * the six native tactic detectors (src/lib/tactics), whose spelling matches
 * our own Motif value exactly (see CLAUDE.md Stage 9, Phases 2–3), plus the
 * two endgame-conversion findings (Stage 11, src/lib/endgameConversion.ts).
 * The eval-based motifs (missed_mate, walked_into_mate) and the coarse
 * fallbacks (hung_material, positional) have no such 1:1 Lichess theme, so
 * they show a tally here but no "Train" button. Note: rookEndgame/
 * queenEndgame are game-level findings, never returned by classifyMotif,
 * so they won't actually appear as a row here until a game with that
 * finding has been analyzed — they're trainable via the game review
 * page's callout in the meantime; a proper aggregate tally isn't built.
 */
const TRAINABLE_MOTIFS = new Set([
  "fork",
  "pin",
  "skewer",
  "discoveredCheck",
  "doubleCheck",
  "backRankMate",
  "rookEndgame",
  "queenEndgame",
]);

interface PuzzleProgress {
  attempted: number;
  solved: number;
}

export default function TrainPage() {
  const [username, setUsername] = useState("jph093");
  const [summary, setSummary] = useState<MotifSummary[]>([]);
  const [progressByMotif, setProgressByMotif] = useState<Map<string, PuzzleProgress>>(new Map());
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  async function fetchWeakSpots() {
    setStatus("loading");
    setError(null);
    setHasSearched(true);

    try {
      const res = await fetch(`/api/weak-spots?username=${encodeURIComponent(username)}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Failed to fetch weak spots");
      }

      setSummary(data.motifs);
      setStatus("idle");

      // Best-effort: fetch puzzle-training progress for trainable motifs.
      // Doesn't block the weak-spot list from rendering.
      for (const { motif } of data.motifs as MotifSummary[]) {
        if (!TRAINABLE_MOTIFS.has(motif)) continue;
        fetch(
          `/api/training/history?username=${encodeURIComponent(username)}&motif=${encodeURIComponent(motif)}`,
        )
          .then((r) => r.json())
          .then((history: PuzzleProgress) => {
            setProgressByMotif((prev) => new Map(prev).set(motif, history));
          })
          .catch(() => {});
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch weak spots");
      setStatus("error");
    }
  }

  return (
    <div className={styles.shell}>
      <AppRail username={username} />

      <main className={styles.main}>
        <div className={styles.center}>
          <h1 className={styles.title}>Train your weak spots</h1>
          <p className={styles.subtitle}>
            Drill puzzles that target the tactics behind your flagged mistakes.
          </p>

          <form
            className={styles.searchRow}
            onSubmit={(e) => {
              e.preventDefault();
              fetchWeakSpots();
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
              {status === "loading" ? "Fetching…" : "Fetch weak spots"}
            </button>
          </form>

          {status === "error" && (
            <div className={styles.errorBlock}>
              <p className={styles.errorHeading}>Couldn&apos;t load weak spots</p>
              <p>{error}</p>
              <button className={styles.primaryButton} onClick={fetchWeakSpots}>
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

          {status === "idle" && hasSearched && summary.length === 0 && (
            <div className={styles.empty}>
              <p className={styles.emptyTitle}>No flagged mistakes yet</p>
              <p className={styles.emptyHint}>
                Analyze a few games from the library first — mistakes show up here once found.
              </p>
            </div>
          )}

          {summary.length > 0 && (
            <div className={styles.list}>
              {summary.map((row) => {
                const trainable = TRAINABLE_MOTIFS.has(row.motif);
                const progress = progressByMotif.get(row.motif);
                return (
                  <div key={row.motif} className={styles.row}>
                    <div className={styles.rowInfo}>
                      <span className={styles.rowLabel}>{row.label}</span>
                      <span className={styles.rowDetail}>
                        <span className={styles.stat}>{row.count}</span> flagged, avg{" "}
                        <span className={styles.stat}>{row.avgCentipawnLoss}</span>cp lost
                        {trainable && progress && (
                          <>
                            {" — "}
                            <span className={styles.stat}>{progress.solved}</span>/
                            <span className={styles.stat}>{progress.attempted}</span> puzzles
                            solved
                          </>
                        )}
                      </span>
                    </div>
                    {trainable ? (
                      <Link
                        href={`/train/${row.motif}?username=${encodeURIComponent(username)}`}
                        className={styles.trainButton}
                      >
                        Train
                      </Link>
                    ) : (
                      <span className={styles.notTrainable}>No puzzles for this yet</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
