import type { ParsedGame, ParsedMove } from "./gameParser";
import { EngineScore, StockfishSession } from "./stockfish";

export type MoveClassification =
  | "best"
  | "good"
  | "inaccuracy"
  | "mistake"
  | "blunder";

export type GamePhase = "opening" | "middlegame" | "endgame";

export interface MoveAnalysis {
  ply: number;
  color: "w" | "b";
  san: string;
  /** How much worse (in centipawns, from the mover's perspective) this move was than the engine's top choice. Never negative. */
  centipawnLoss: number;
  classification: MoveClassification;
  phase: GamePhase;
  /** Engine's top choice from the position before this move, in UCI notation (e.g. "e2e4"). */
  bestMove: string;
  playedBestMove: boolean;
  /** White-perspective score of the position before this move. */
  evalBefore: EngineScore | null;
  /** White-perspective score of the position after this move. */
  evalAfter: EngineScore | null;
}

export interface GameAnalysis {
  uuid: string;
  depth: number;
  moves: MoveAnalysis[];
}

export const DEFAULT_ANALYSIS_DEPTH = 12;

const STARTING_POSITION_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/** A mate score is treated as this many "centipawns", minus 1 per move to mate, so closer mates outrank farther ones. */
const MATE_SCORE_CP = 100_000;

function scoreToCentipawns(score: EngineScore | null): number {
  if (!score) return 0;
  if (score.type === "cp") return score.value;
  const sign = score.value > 0 ? 1 : -1;
  return sign * (MATE_SCORE_CP - Math.abs(score.value));
}

function classifyMove(centipawnLoss: number): MoveClassification {
  if (centipawnLoss <= 10) return "best";
  if (centipawnLoss <= 50) return "good";
  if (centipawnLoss <= 100) return "inaccuracy";
  if (centipawnLoss <= 200) return "mistake";
  return "blunder";
}

/**
 * Rough phase heuristic: the first 10 full moves are the opening; past
 * that, a position with few non-pawn/king pieces left on the board (queens
 * traded, only a handful of minors/rooks remaining) is the endgame;
 * everything else is the middlegame.
 */
function classifyPhase(fenBefore: string, moveNumber: number): GamePhase {
  if (moveNumber <= 10) return "opening";

  const placement = fenBefore.split(" ")[0];
  const majorMinorPieceCount = (placement.match(/[qrbnQRBN]/g) ?? []).length;
  if (majorMinorPieceCount <= 6) return "endgame";

  return "middlegame";
}

function toUciMove(move: ParsedMove): string {
  return `${move.from}${move.to}${move.promotion ?? ""}`;
}

/**
 * Evaluates every position of a game once (the starting position plus the
 * result of each move — a move's "before" position is the previous move's
 * "after" position, so this needs N+1 engine calls for N moves, not 2N),
 * and diffs each move played against the engine's top choice from the
 * position before it.
 */
export async function analyzeGame(
  parsed: ParsedGame,
  options: { depth?: number } = {},
): Promise<GameAnalysis> {
  const depth = options.depth ?? DEFAULT_ANALYSIS_DEPTH;
  const session = new StockfishSession();

  try {
    const fenBeforeFirstMove = parsed.moves[0]?.fenBefore ?? STARTING_POSITION_FEN;
    let previousEval = await session.evaluate(fenBeforeFirstMove, { depth });

    const moves: MoveAnalysis[] = [];

    for (const move of parsed.moves) {
      const afterEval = await session.evaluate(move.fenAfter, { depth });

      const moverSign = move.color === "w" ? 1 : -1;
      const evalBeforeForMover = scoreToCentipawns(previousEval.score) * moverSign;
      const evalAfterForMover = scoreToCentipawns(afterEval.score) * moverSign;
      const centipawnLoss = Math.max(0, evalBeforeForMover - evalAfterForMover);

      moves.push({
        ply: move.ply,
        color: move.color,
        san: move.san,
        centipawnLoss,
        classification: classifyMove(centipawnLoss),
        phase: classifyPhase(move.fenBefore, move.moveNumber),
        bestMove: previousEval.bestMove,
        playedBestMove: toUciMove(move) === previousEval.bestMove,
        evalBefore: previousEval.score,
        evalAfter: afterEval.score,
      });

      previousEval = afterEval;
    }

    return { uuid: parsed.uuid, depth, moves };
  } finally {
    session.quit();
  }
}
