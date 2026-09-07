import type { EngineScore } from "@/lib/stockfish";
import styles from "./EvalBar.module.css";

function whiteShare(score: EngineScore | null): number {
  if (!score) return 50;
  if (score.type === "mate") return score.favors === "b" ? 0 : 100;

  // Standard cp-to-win-share sigmoid, clamped.
  const share = 50 + 50 * (2 / (1 + Math.exp(-score.value / 400)) - 1);
  return Math.min(100, Math.max(0, share));
}

function formatScore(score: EngineScore | null): string {
  if (!score) return "—";
  if (score.type === "mate") return `${score.favors === "b" ? "-" : ""}M${score.value}`;
  const pawns = score.value / 100;
  return `${pawns > 0 ? "+" : ""}${pawns.toFixed(2)}`;
}

export function EvalBar({ score }: { score: EngineScore | null }) {
  const share = whiteShare(score);

  return (
    <div className={styles.wrapper}>
      <span className={styles.readout}>{formatScore(score)}</span>
      <div className={styles.bar} title="Evaluation, from White's perspective">
        <div className={styles.whiteShare} style={{ height: `${share}%` }} />
      </div>
    </div>
  );
}
