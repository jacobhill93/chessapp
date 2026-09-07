import { Chess, PieceSymbol, Square } from "chess.js";
import type { MoveAnalysis } from "./analysis";

export type Motif = "missed_mate" | "walked_into_mate" | "hung_material" | "positional";

export const MOTIF_LABELS: Record<Motif, string> = {
  missed_mate: "Missed a forced mate",
  walked_into_mate: "Walked into a forced mate",
  hung_material: "Hung material",
  positional: "Positional drift",
};

const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 100,
  n: 300,
  b: 300,
  r: 500,
  q: 900,
  k: 0,
};

const HUNG_MATERIAL_THRESHOLD_CP = 300;

function opponentOf(color: "w" | "b"): "w" | "b" {
  return color === "w" ? "b" : "w";
}

/**
 * Tags a flagged move with a coarse, cheaply-computed motif. This is a
 * simple heuristic, not real tactic recognition — it won't catch every
 * fork/pin/skewer, and "hung_material" is an approximation: it only
 * checks whether the engine's top reply immediately after the mistake
 * targets one of the mover's own pieces, not a full exchange evaluation
 * (so an even trade can still get flagged, and a hung piece recovered a
 * few moves later won't be). "positional" is the catch-all for anything
 * that doesn't match a specific pattern.
 *
 * `nextMove` is this game's MoveAnalysis for the ply right after `move`
 * (undefined if `move` was the last move played, e.g. it ended the game).
 */
export function classifyMotif(
  move: MoveAnalysis,
  nextMove: MoveAnalysis | undefined,
): Motif {
  const opponent = opponentOf(move.color);

  const hadForcedMate = move.evalBefore?.type === "mate" && move.evalBefore.favors === move.color;
  const keptForcedMate = move.evalAfter?.type === "mate" && move.evalAfter.favors === move.color;
  if (hadForcedMate && !keptForcedMate) return "missed_mate";

  const opponentAlreadyMating =
    move.evalBefore?.type === "mate" && move.evalBefore.favors === opponent;
  const opponentNowMating = move.evalAfter?.type === "mate" && move.evalAfter.favors === opponent;
  if (opponentNowMating && !opponentAlreadyMating) return "walked_into_mate";

  if (nextMove) {
    const chess = new Chess(move.fenAfter);
    const targetSquare = nextMove.bestMove.slice(2, 4) as Square;
    const piece = chess.get(targetSquare);
    if (
      piece &&
      piece.color === move.color &&
      PIECE_VALUES[piece.type] >= HUNG_MATERIAL_THRESHOLD_CP
    ) {
      return "hung_material";
    }
  }

  return "positional";
}
