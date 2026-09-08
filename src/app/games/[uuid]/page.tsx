"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, RotateCw } from "lucide-react";
import { AppRail } from "@/app/AppRail";
import { Board } from "@/app/board/Board";
import { EvalBar } from "./EvalBar";
import { MoveGlyphLegend, MoveList } from "./MoveList";
import type { ChessComGame } from "@/lib/chesscom";
import type { ParsedGame } from "@/lib/gameParser";
import type { GameAnalysis, MoveAnalysis } from "@/lib/analysis";
import type { EndgameConversionFinding } from "@/lib/endgameConversion";
import styles from "./page.module.css";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

type AnalysisWithEndgame = GameAnalysis & { endgameFinding: EndgameConversionFinding | null };

const DRAW_REASON_LABELS: Record<string, string> = {
  "50move": "the 50-move rule",
  repetition: "repetition",
  stalemate: "stalemate",
  agreed: "agreement",
  insufficient: "insufficient material",
  timevsinsufficient: "time vs. insufficient material",
};

export default function GameReviewPage() {
  const params = useParams<{ uuid: string }>();
  const searchParams = useSearchParams();
  const username = searchParams.get("username") ?? "";
  const uuid = params.uuid;

  const [game, setGame] = useState<ChessComGame | null>(null);
  const [parsed, setParsed] = useState<ParsedGame | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisWithEndgame | null>(null);
  const [currentPly, setCurrentPly] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const [loadStatus, setLoadStatus] = useState<"loading" | "idle" | "error">("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<"idle" | "loading" | "error">("idle");
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  useEffect(() => {
    if (!username || !uuid) return;
    let cancelled = false;

    async function load() {
      setLoadStatus("loading");
      setLoadError(null);
      try {
        const [gamesRes, positionsRes] = await Promise.all([
          fetch(`/api/games?username=${encodeURIComponent(username)}`),
          fetch(
            `/api/positions?username=${encodeURIComponent(username)}&uuid=${encodeURIComponent(uuid)}`,
          ),
        ]);
        const gamesData = await gamesRes.json();
        const positionsData = await positionsRes.json();

        if (!gamesRes.ok) throw new Error(gamesData.error ?? "Failed to load game");
        if (!positionsRes.ok) throw new Error(positionsData.error ?? "Failed to parse game");
        if (cancelled) return;

        const foundGame =
          gamesData.games.find((g: ChessComGame) => g.uuid === uuid) ?? null;
        setGame(foundGame);
        setParsed(positionsData);
        setLoadStatus("idle");

        // Default orientation: your own pieces at the bottom.
        if (foundGame) {
          const isWhite = foundGame.white.username.toLowerCase() === username.toLowerCase();
          setFlipped(!isWhite);
        }
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Failed to load game");
        setLoadStatus("error");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [username, uuid]);

  async function runAnalysis() {
    setAnalysisStatus("loading");
    setAnalysisError(null);
    try {
      const res = await fetch(
        `/api/analysis?username=${encodeURIComponent(username)}&uuid=${encodeURIComponent(uuid)}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to analyze game");
      setAnalysis(data);
      setAnalysisStatus("idle");
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : "Failed to analyze game");
      setAnalysisStatus("error");
    }
  }

  const analysisByPly = useMemo(() => {
    if (!analysis) return undefined;
    return new Map<number, MoveAnalysis>(analysis.moves.map((m) => [m.ply, m]));
  }, [analysis]);

  const maxPly = parsed?.moves.length ?? 0;
  const currentFen =
    currentPly === 0 ? STARTING_FEN : (parsed?.moves[currentPly - 1]?.fenAfter ?? STARTING_FEN);
  const currentMove = currentPly > 0 ? parsed?.moves[currentPly - 1] : undefined;
  const lastMove = currentMove ? { from: currentMove.from, to: currentMove.to } : undefined;
  const currentAnalysis = analysisByPly?.get(currentPly);
  const startEval = analysis?.moves[0]?.evalBefore ?? null;
  const evalScore = currentPly === 0 ? startEval : (currentAnalysis?.evalAfter ?? null);
  const hintMove =
    currentAnalysis && !currentAnalysis.playedBestMove
      ? { from: currentAnalysis.bestMove.slice(0, 2), to: currentAnalysis.bestMove.slice(2, 4) }
      : undefined;

  const result = game?.pgn.match(/\[Result "(.*?)"\]/)?.[1];
  const date = game ? new Date(game.end_time * 1000).toLocaleDateString() : "";

  if (!username) {
    return (
      <div className={styles.shell}>
        <main className={styles.main}>
          <p className={styles.errorBlock}>
            Missing username — open this game from the library page.
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
          {loadStatus === "error" && <p className={styles.errorBlock}>{loadError}</p>}

          {game && (
            <div className={styles.meta}>
              <span className={styles.metaTitle}>
                {game.white.username} vs {game.black.username}
              </span>
              <span className={styles.metaDetail}>
                {date} — {game.time_class} — {result}
              </span>
            </div>
          )}

          {analysis?.endgameFinding && (
            <div className={styles.endgameCallout}>
              <p className={styles.endgameCalloutText}>
                You reached a winning <strong>{analysis.endgameFinding.label}</strong> endgame
                around move {Math.ceil(analysis.endgameFinding.sincePly / 2)}, but the game ended
                in a {analysis.endgameFinding.outcome}
                {analysis.endgameFinding.drawReason
                  ? ` (${DRAW_REASON_LABELS[analysis.endgameFinding.drawReason] ?? analysis.endgameFinding.drawReason})`
                  : ""}
                .
              </p>
              <Link
                href={`/train/${analysis.endgameFinding.motif}?username=${encodeURIComponent(username)}`}
                className={styles.endgameCalloutLink}
              >
                Practice this endgame
              </Link>
            </div>
          )}

          <div className={styles.boardRow}>
            <EvalBar score={evalScore} flipped={flipped} />
            <div className={styles.boardColumn}>
              <Board fen={currentFen} lastMove={lastMove} hintMove={hintMove} flipped={flipped} />
            </div>
          </div>

          <div className={styles.controls}>
            <button
              className={styles.iconButton}
              onClick={() => setCurrentPly(0)}
              disabled={currentPly === 0}
              aria-label="Go to start"
            >
              <ChevronsLeft size={16} />
            </button>
            <button
              className={styles.iconButton}
              onClick={() => setCurrentPly((p) => Math.max(0, p - 1))}
              disabled={currentPly === 0}
              aria-label="Previous move"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              className={styles.iconButton}
              onClick={() => setCurrentPly((p) => Math.min(maxPly, p + 1))}
              disabled={currentPly === maxPly}
              aria-label="Next move"
            >
              <ChevronRight size={16} />
            </button>
            <button
              className={styles.iconButton}
              onClick={() => setCurrentPly(maxPly)}
              disabled={currentPly === maxPly}
              aria-label="Go to end"
            >
              <ChevronsRight size={16} />
            </button>
            <button
              className={styles.iconButton}
              onClick={() => setFlipped((f) => !f)}
              aria-label="Flip board"
            >
              <RotateCw size={16} />
            </button>
          </div>
        </div>
      </main>

      <section className={styles.panel}>
        <div className={styles.panelSection} style={{ flex: "0 0 auto" }}>
          {!analysis ? (
            <>
              <p className={styles.hint}>
                Evaluate every move with Stockfish to see mistakes and best moves.
              </p>
              <button
                className={styles.primaryButton}
                onClick={runAnalysis}
                disabled={analysisStatus === "loading" || !parsed}
              >
                {analysisStatus === "loading" ? "Analyzing — this can take a bit…" : "Analyze this game"}
              </button>
              {analysisStatus === "error" && <p className={styles.errorBlock}>{analysisError}</p>}
            </>
          ) : (
            <p className={styles.hint}>Analyzed at depth {analysis.depth}.</p>
          )}
        </div>

        <div className={styles.panelSection} style={{ flex: 1, minHeight: 0 }}>
          <h2 className={styles.panelHeading}>Moves</h2>
          <div className={styles.moveListWrap}>
            {parsed && (
              <MoveList
                moves={parsed.moves}
                analysisByPly={analysisByPly}
                currentPly={currentPly}
                onSelectPly={setCurrentPly}
              />
            )}
          </div>
        </div>

        <div className={styles.panelSection} style={{ flex: "0 0 auto" }}>
          <h2 className={styles.panelHeading}>Legend</h2>
          <MoveGlyphLegend />
        </div>
      </section>
    </div>
  );
}
