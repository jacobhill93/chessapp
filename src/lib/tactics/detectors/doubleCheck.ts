import { Square } from "chess.js";
import { MoveContext } from "../context";

export interface DoubleCheckResult {
  motif: "doubleCheck";
  checkerSquares: Square[];
}

/** Ported from chess_detect's DoubleCheckDetector: two+ pieces check the king at once after the move. */
export function detectDoubleCheck(ctx: MoveContext): DoubleCheckResult | undefined {
  if (!ctx.isCheck) return undefined;
  if (ctx.attackersCount < 2) return undefined;
  return { motif: "doubleCheck", checkerSquares: ctx.attackersOnKing };
}
