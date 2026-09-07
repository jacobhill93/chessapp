import { Square } from "chess.js";
import { MoveContext, PIECE_VALUES } from "../context";

export interface DiscoveredCheckResult {
  motif: "discoveredCheck";
  checkerSquare: Square;
  /** Square of whatever extra value the moved piece grabbed/threatened, if any. */
  targetSquare?: Square;
}

/**
 * Ported from chess_detect's DiscoveredCheckDetector. A discovered check is
 * a check delivered by a piece that didn't move — the moved piece uncovered
 * it. Only flagged when the moved piece also does something useful with the
 * tempo: captures, threatens something more valuable than itself, or
 * threatens something undefended.
 */
export function detectDiscoveredCheck(ctx: MoveContext): DiscoveredCheckResult | undefined {
  if (!ctx.isCheck) return undefined;

  const checkerSquare = ctx.boardAfter.attackers(ctx.kingSquare!, ctx.movingColor).find(
    (sq) => sq !== ctx.move.to,
  );
  if (checkerSquare === undefined) return undefined;

  const piece = ctx.movedPiece;
  if (!piece) return undefined;
  const pieceValue = PIECE_VALUES[piece.type];

  let bestTarget: Square | undefined;
  for (const targetSquare of ctx.pieceAttacks) {
    const target = ctx.boardAfter.get(targetSquare);
    if (!target || target.color === ctx.movingColor || target.type === "k") continue;

    const targetValue = PIECE_VALUES[target.type];
    if (targetValue > pieceValue) {
      bestTarget = targetSquare;
      break;
    }
    if (!ctx.boardAfter.isAttacked(targetSquare, ctx.opponentColor) && bestTarget === undefined) {
      bestTarget = targetSquare;
    }
  }

  if (bestTarget !== undefined) {
    return { motif: "discoveredCheck", checkerSquare, targetSquare: bestTarget };
  }

  // A capture with no extra threat is still good — the opponent can't recapture while in check.
  if (ctx.isCapture) {
    for (const targetSquare of ctx.pieceAttacks) {
      const target = ctx.boardAfter.get(targetSquare);
      if (target && target.color !== ctx.movingColor && target.type !== "k") {
        return { motif: "discoveredCheck", checkerSquare, targetSquare };
      }
    }
    return { motif: "discoveredCheck", checkerSquare, targetSquare: ctx.move.to };
  }

  return undefined;
}
