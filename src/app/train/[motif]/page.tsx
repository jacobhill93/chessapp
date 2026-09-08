"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { AppRail } from "@/app/AppRail";
import { Board, PromotionPieceType } from "@/app/board/Board";
import { MOTIF_LABELS, Motif } from "@/lib/motif";
import styles from "./page.module.css";

interface PuzzleData {
  puzzleId: string;
  fen: string;
  toMove: "w" | "b";
  rating: number;
  totalMoves: number;
}

type Feedback = { kind: "correct"; san?: string } | { kind: "wrong" } | null;

export default function PuzzleTrainPage() {
  const params = useParams<{ motif: string }>();
  const searchParams = useSearchParams();
  const username = searchParams.get("username") ?? "";
  const motif = params.motif;
  const motifLabel = MOTIF_LABELS[motif as Motif] ?? motif;

  const [puzzle, setPuzzle] = useState<PuzzleData | null>(null);
  const [fen, setFen] = useState<string | null>(null);
  const [moveIndex, setMoveIndex] = useState(0);
  const [solved, setSolved] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [status, setStatus] = useState<"loading" | "playing" | "grading" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [solvedThisSession, setSolvedThisSession] = useState(0);

  async function loadPuzzle() {
    if (!username || !motif) return;
    setStatus("loading");
    setError(null);
    setFeedback(null);
    setSolved(false);
    setMoveIndex(0);
    setPuzzle(null);

    try {
      const res = await fetch(
        `/api/training/puzzle?username=${encodeURIComponent(username)}&motif=${encodeURIComponent(motif)}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to fetch puzzle");
      setPuzzle(data);
      setFen(data.fen);
      setStatus("playing");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch puzzle");
      setStatus("error");
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (cancelled) return;
      await loadPuzzle();
    }

    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username, motif]);

  async function handleMove(from: string, to: string, promotion?: PromotionPieceType) {
    if (!puzzle || status !== "playing") return;
    setStatus("grading");
    setFeedback(null);

    try {
      const res = await fetch("/api/training/attempt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          motif,
          puzzleId: puzzle.puzzleId,
          moveIndex,
          from,
          to,
          promotion,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to grade move");

      setFen(data.fenAfter);
      setStatus("playing");

      if (data.correct) {
        setFeedback({ kind: "correct", san: data.opponentReplySan });
        setMoveIndex(data.nextMoveIndex);
        if (data.solved) {
          setSolved(true);
          setSolvedThisSession((c) => c + 1);
        }
      } else {
        setFeedback({ kind: "wrong" });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to grade move");
      setStatus("error");
    }
  }

  const interactive = status === "playing" && !solved;
  const flipped = puzzle?.toMove === "b";

  if (!username) {
    return (
      <div className={styles.shell}>
        <main className={styles.main}>
          <p className={styles.errorBlock}>
            Missing username — open this page from the weak-spots list.
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <AppRail username={username} />

      <main className={styles.main}>
        <div className={styles.center}>
          <div className={styles.meta}>
            <span className={styles.metaTitle}>{motifLabel}</span>
            {puzzle && (
              <span className={styles.metaDetail}>
                Puzzle rating {puzzle.rating} — {puzzle.totalMoves} move
                {puzzle.totalMoves === 1 ? "" : "s"} to find
              </span>
            )}
          </div>

          {status === "error" && <p className={styles.errorBlock}>{error}</p>}

          <div className={styles.boardRow}>
            <div className={styles.boardColumn}>
              {fen && (
                <Board fen={fen} flipped={flipped} interactive={interactive} onMove={handleMove} />
              )}
            </div>
          </div>
        </div>
      </main>

      <section className={styles.panel}>
        <div className={styles.panelSection}>
          <h2 className={styles.panelHeading}>Your move</h2>
          {status === "loading" && <p className={styles.hint}>Fetching a puzzle…</p>}
          {status === "playing" && !feedback && !solved && (
            <p className={styles.hint}>
              {puzzle?.toMove === "w" ? "White" : "Black"} to move — find the {motifLabel.toLowerCase()}.
            </p>
          )}
          {feedback?.kind === "correct" && !solved && (
            <p className={`${styles.feedback} ${styles.feedbackCorrect}`}>
              Correct.{feedback.san ? ` Opponent replies ${feedback.san} — keep going.` : ""}
            </p>
          )}
          {feedback?.kind === "wrong" && (
            <p className={`${styles.feedback} ${styles.feedbackWrong}`}>Not quite — try again.</p>
          )}
          {solved && (
            <p className={`${styles.feedback} ${styles.feedbackSolved}`}>Puzzle solved.</p>
          )}
          {solvedThisSession > 0 && (
            <p className={styles.hint}>{solvedThisSession} solved this session.</p>
          )}
          <button
            type="button"
            className={styles.primaryButton}
            onClick={loadPuzzle}
            disabled={status === "loading" || status === "grading"}
          >
            {solved ? "Next puzzle" : "Skip puzzle"}
          </button>
        </div>
      </section>
    </div>
  );
}
