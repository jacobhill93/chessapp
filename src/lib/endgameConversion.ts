import { Chess, Color } from "chess.js";
import { isDrawResult } from "./chesscom";
import type { GameAnalysis } from "./analysis";

/**
 * Detects a specific, unambiguous kind of endgame weakness: the player
 * reached one of the classical "basic checkmate" material balances (a lone
 * king against king + rook, or king + queen — nothing else on the board for
 * either side but pawns on the winning side) and the game still didn't end
 * in a win for them. Unlike src/lib/motif.ts's tactic detectors, this is a
 * *game*-level finding, not a per-move one: every individual move can still
 * grade as "best" by Stockfish (the position never stopped being
 * completely winning), so there's no flagged mistake to hang this on — the
 * failure is "never delivered the mate," not "played a bad move."
 *
 * Deliberately narrow for a first pass: only rook-only and queen-only bare
 * endings, not king+two-bishops or king+bishop+knight (rarer in practice,
 * and Lichess has no clean single puzzle theme for the bishop+knight case
 * specifically — see CLAUDE.md).
 */

export type EndgameMotif = "rookEndgame" | "queenEndgame";

export interface EndgameConversionFinding {
  motif: EndgameMotif;
  label: string;
  /** Ply where this material balance first appeared and then held to the end of the game. */
  sincePly: number;
  outcome: "draw" | "loss";
  /** Chess.com's own draw-reason code (e.g. "50move", "repetition"), when outcome is "draw". */
  drawReason?: string;
}

const ENDGAME_LABELS: Record<EndgameMotif, string> = {
  rookEndgame: "King + Rook vs King",
  queenEndgame: "King + Queen vs King",
};

/** How many consecutive plies the bare-king material balance must hold through to the end of the game to count as "reached," not just a fleeting in-between position. */
const MIN_SUSTAINED_PLIES = 10;

function materialSignature(fen: string, winnerColor: Color): EndgameMotif | null {
  const chess = new Chess(fen);
  const pieces = chess.board().flat().filter((p) => p !== null);
  const loserColor: Color = winnerColor === "w" ? "b" : "w";

  const loserHasExtraMaterial = pieces.some(
    (p) => p.color === loserColor && p.type !== "k",
  );
  if (loserHasExtraMaterial) return null;

  const winnerPieces = pieces.filter(
    (p) => p.color === winnerColor && p.type !== "k" && p.type !== "p",
  );
  if (winnerPieces.length === 1 && winnerPieces[0].type === "r") return "rookEndgame";
  if (winnerPieces.length === 1 && winnerPieces[0].type === "q") return "queenEndgame";
  return null;
}

/**
 * `userResult` is the chess.com per-side result string (e.g. "win",
 * "agreed", "repetition", "resigned") for the analyzed user, not the raw
 * PGN result tag.
 */
export function detectEndgameConversionFailure(
  analysis: GameAnalysis,
  userColor: Color,
  userResult: string,
): EndgameConversionFinding | null {
  if (userResult === "win") return null;

  let signature: EndgameMotif | null = null;
  let sincePly: number | null = null;
  let sustainedCount = 0;

  for (const move of analysis.moves) {
    const sig = materialSignature(move.fenAfter, userColor);
    if (sig) {
      if (signature !== sig) {
        signature = sig;
        sincePly = move.ply;
        sustainedCount = 1;
      } else {
        sustainedCount++;
      }
    } else {
      signature = null;
      sincePly = null;
      sustainedCount = 0;
    }
  }

  if (!signature || sincePly === null || sustainedCount < MIN_SUSTAINED_PLIES) return null;

  return {
    motif: signature,
    label: ENDGAME_LABELS[signature],
    sincePly,
    outcome: isDrawResult(userResult) ? "draw" : "loss",
    drawReason: isDrawResult(userResult) ? userResult : undefined,
  };
}
