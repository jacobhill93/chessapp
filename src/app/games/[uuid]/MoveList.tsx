import type { MoveAnalysis, MoveClassification } from "@/lib/analysis";
import type { ParsedMove } from "@/lib/gameParser";
import styles from "./MoveList.module.css";

function glyphFor(classification: MoveClassification | undefined) {
  switch (classification) {
    case "best":
      return { symbol: "!", className: styles.glyphBest };
    case "inaccuracy":
      return { symbol: "?!", className: styles.glyphWarn };
    case "mistake":
      return { symbol: "?", className: styles.glyphWarn };
    case "blunder":
      return { symbol: "??", className: styles.glyphBlunder };
    default:
      return null;
  }
}

function MoveButton({
  move,
  analysis,
  isCurrent,
  onSelect,
}: {
  move: ParsedMove;
  analysis?: MoveAnalysis;
  isCurrent: boolean;
  onSelect: () => void;
}) {
  const glyph = glyphFor(analysis?.classification);
  const title = analysis ? `${analysis.centipawnLoss}cp lost` : undefined;

  return (
    <button
      type="button"
      className={`${styles.moveButton} ${isCurrent ? styles.current : ""}`}
      onClick={onSelect}
      title={title}
    >
      {move.san}
      {glyph && <span className={`${styles.glyph} ${glyph.className}`}>{glyph.symbol}</span>}
    </button>
  );
}

export function MoveList({
  moves,
  analysisByPly,
  currentPly,
  onSelectPly,
}: {
  moves: ParsedMove[];
  analysisByPly?: Map<number, MoveAnalysis>;
  currentPly: number;
  onSelectPly: (ply: number) => void;
}) {
  if (moves.length === 0) {
    return (
      <div className={styles.list}>
        <p className={styles.empty}>No moves were played in this game.</p>
      </div>
    );
  }

  const rows: { moveNumber: number; white?: ParsedMove; black?: ParsedMove }[] = [];
  for (const move of moves) {
    if (move.color === "w") {
      rows.push({ moveNumber: move.moveNumber, white: move });
    } else {
      const row = rows[rows.length - 1];
      if (row && row.moveNumber === move.moveNumber) {
        row.black = move;
      } else {
        rows.push({ moveNumber: move.moveNumber, black: move });
      }
    }
  }

  return (
    <div className={styles.list} role="listbox" aria-label="Move list">
      {rows.map((row) => (
        <div key={row.moveNumber} style={{ display: "contents" }}>
          <span className={styles.moveNumber}>{row.moveNumber}.</span>
          {row.white ? (
            <MoveButton
              move={row.white}
              analysis={analysisByPly?.get(row.white.ply)}
              isCurrent={currentPly === row.white.ply}
              onSelect={() => onSelectPly(row.white!.ply)}
            />
          ) : (
            <span />
          )}
          {row.black ? (
            <MoveButton
              move={row.black}
              analysis={analysisByPly?.get(row.black.ply)}
              isCurrent={currentPly === row.black.ply}
              onSelect={() => onSelectPly(row.black!.ply)}
            />
          ) : (
            <span />
          )}
        </div>
      ))}
    </div>
  );
}
