import { Square } from "chess.js";
import { MoveContext } from "../context";

export interface BackRankMateResult {
  motif: "backRankMate";
  checkerSquare: Square;
  kingSquare: Square;
}

/**
 * Not in chess-detect — built from scratch (see CLAUDE.md Stage 9's motif
 * coverage tracker). Deliberately narrow for a first pass: only flags a
 * checkmate actually delivered by a rook or queen along the king's own back
 * rank (rank 1 for White, rank 8 for Black), the textbook back-rank mate
 * shape. Doesn't (yet) flag a back-rank *threat* that wasn't converted, or
 * a mate pattern along a file/diagonal against a king merely standing on
 * the back rank — both would need searching the position for a threat that
 * didn't happen, which is a bigger feature than this pass needs.
 */
export function detectBackRankMate(ctx: MoveContext): BackRankMateResult | undefined {
  if (!ctx.boardAfter.isCheckmate()) return undefined;

  const kingSquare = ctx.kingSquare;
  if (!kingSquare) return undefined;

  const backRank = ctx.opponentColor === "w" ? "1" : "8";
  if (kingSquare[1] !== backRank) return undefined;

  const checkerSquare = ctx.attackersOnKing.find((sq) => {
    const piece = ctx.boardAfter.get(sq);
    return piece && (piece.type === "r" || piece.type === "q") && sq[1] === backRank;
  });
  if (checkerSquare === undefined) return undefined;

  return { motif: "backRankMate", checkerSquare, kingSquare };
}
