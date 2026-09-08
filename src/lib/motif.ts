import { Chess, PieceSymbol, Square } from "chess.js";
import type { MoveAnalysis } from "./analysis";
import { detectTactics, TacticMotif } from "./tactics";

export type Motif =
  | "missed_mate"
  | "walked_into_mate"
  | "fork"
  | "pin"
  | "skewer"
  | "discoveredCheck"
  | "doubleCheck"
  | "backRankMate"
  | "hung_material"
  | "positional"
  // Game-level endgame-conversion findings (src/lib/endgameConversion.ts).
  // classifyMotif() below never returns these — they're per-game, not
  // per-move — but they share this Motif/MOTIF_LABELS vocabulary since
  // both feed the same /train/[motif] puzzle screen and Lichess theme
  // lookup.
  | "rookEndgame"
  | "queenEndgame";

export const MOTIF_LABELS: Record<Motif, string> = {
  missed_mate: "Missed a forced mate",
  walked_into_mate: "Walked into a forced mate",
  fork: "Fork",
  pin: "Pin",
  skewer: "Skewer",
  discoveredCheck: "Discovered check",
  doubleCheck: "Double check",
  backRankMate: "Back-rank mate",
  hung_material: "Hung material",
  positional: "Positional drift",
  rookEndgame: "King + Rook vs King",
  queenEndgame: "King + Queen vs King",
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

/**
 * Which tactic to report when a move matches more than one detector (e.g. a
 * discovered check that's also a fork) — roughest/rarest patterns first,
 * since those are the more specific and more instructive finding.
 */
const TACTIC_PRIORITY: NonNullable<TacticMotif>["motif"][] = [
  "doubleCheck",
  "backRankMate",
  "discoveredCheck",
  "skewer",
  "pin",
  "fork",
];

const TACTIC_MOTIF_LABEL: Record<NonNullable<TacticMotif>["motif"], Motif> = {
  fork: "fork",
  pin: "pin",
  skewer: "skewer",
  discoveredCheck: "discoveredCheck",
  doubleCheck: "doubleCheck",
  backRankMate: "backRankMate",
};

function opponentOf(color: "w" | "b"): "w" | "b" {
  return color === "w" ? "b" : "w";
}

/**
 * Runs the native tactic detectors (see src/lib/tactics) on a single UCI
 * move from a given position, and returns the highest-priority motif it
 * matches, if any. Used to check both "what tactic did the engine's
 * recommended move contain" (a missed opportunity) and "what tactic did the
 * opponent's likely reply contain" (a punished mistake) — the same UCI
 * move string, just evaluated from different starting FENs. Defensive
 * against malformed/terminal bestMove values (e.g. a stalemated position
 * has none) since this reads engine output that's crossed a disk-cache
 * boundary, not something freshly validated.
 */
function tacticInMove(fenBefore: string, uciMove: string): Motif | undefined {
  const from = uciMove.slice(0, 2) as Square;
  const to = uciMove.slice(2, 4) as Square;
  const promotion = (uciMove.slice(4) || undefined) as PieceSymbol | undefined;

  let hits: NonNullable<TacticMotif>[];
  try {
    hits = detectTactics(fenBefore, from, to, promotion);
  } catch {
    return undefined;
  }

  for (const key of TACTIC_PRIORITY) {
    if (hits.some((hit) => hit.motif === key)) return TACTIC_MOTIF_LABEL[key];
  }
  return undefined;
}

/**
 * Tags a flagged move with the tactical pattern behind it. Checks, in
 * order: a missed or allowed forced mate (eval-based, not geometric); a
 * concrete tactic (fork/pin/skewer/discovered check/double check/back-rank
 * mate — see src/lib/tactics) in the move the engine recommends instead,
 * i.e. what the player missed; the same tactic check against the
 * opponent's likely reply, i.e. what the mistake let the opponent do;
 * falling back to the older coarse "hung_material" proxy (the opponent's
 * reply just lands on one of the mover's own pieces worth ≥300cp — catches
 * plain undefended-piece losses the geometric detectors don't tag as a
 * named tactic) and finally "positional" as a catch-all.
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

  const missedTactic = tacticInMove(move.fenBefore, move.bestMove);
  if (missedTactic) return missedTactic;

  if (nextMove) {
    const punishingTactic = tacticInMove(nextMove.fenBefore, nextMove.bestMove);
    if (punishingTactic) return punishingTactic;

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
