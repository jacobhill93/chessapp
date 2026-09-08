import { Chess } from "chess.js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { findRandomPuzzleByTheme, getPuzzleById, Puzzle } from "./puzzles";

export class PuzzleNotFoundError extends Error {}
export class IllegalPuzzleMoveError extends Error {}
export class PuzzleAlreadyCompleteError extends Error {}

const DATA_DIR = path.join(process.cwd(), "data", "puzzleDrills");

function historyFilePath(username: string, motif: string) {
  return path.join(DATA_DIR, username.toLowerCase(), `${motif}.json`);
}

export interface PuzzleAttemptRecord {
  timestamp: string;
  puzzleId: string;
  rating: number;
  correct: boolean;
  /** True once this attempt completed the puzzle (its last solving move, correctly played). */
  solved: boolean;
}

export async function getPuzzleAttemptHistory(
  username: string,
  motif: string,
): Promise<PuzzleAttemptRecord[]> {
  try {
    const contents = await readFile(historyFilePath(username, motif), "utf-8");
    return JSON.parse(contents) as PuzzleAttemptRecord[];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    return [];
  }
}

async function appendPuzzleAttempt(
  username: string,
  motif: string,
  record: PuzzleAttemptRecord,
): Promise<void> {
  const history = await getPuzzleAttemptHistory(username, motif);
  history.push(record);

  const filePath = historyFilePath(username, motif);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(history), "utf-8");
}

/** Distinct puzzle ids solved vs. merely attempted, for a "N solved" progress readout. */
export async function getPuzzleTrainingSummary(
  username: string,
  motif: string,
): Promise<{ attempted: number; solved: number }> {
  const history = await getPuzzleAttemptHistory(username, motif);
  const attemptedIds = new Set(history.map((r) => r.puzzleId));
  const solvedIds = new Set(history.filter((r) => r.solved).map((r) => r.puzzleId));
  return { attempted: attemptedIds.size, solved: solvedIds.size };
}

function toUci(from: string, to: string, promotion?: string): string {
  return `${from}${to}${promotion ?? ""}`;
}

function applyUciMoves(fen: string, uciMoves: string[]): Chess {
  const chess = new Chess(fen);
  for (const uci of uciMoves) {
    chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4) || undefined });
  }
  return chess;
}

/**
 * Number of moves the *solver* must find. Lichess's `moves` array is
 * [setupMove, solve1, reply1, solve2, reply2, ...] — solving moves sit at
 * the odd indices, so this is everything after the setup move, halved and
 * rounded up (the final solving move has no forced reply after it).
 */
function totalSolvingMoves(puzzle: Puzzle): number {
  return Math.ceil((puzzle.moves.length - 1) / 2);
}

/**
 * The board position once the setup move and `moveIndex` complete
 * solve/reply pairs have been played — i.e. the position the solver needs
 * to find solving move `moveIndex` (0-based) from.
 */
export function getPuzzlePosition(
  puzzle: Puzzle,
  moveIndex: number,
): { fen: string; toMove: "w" | "b" } {
  const movesSoFar = puzzle.moves.slice(0, 1 + 2 * moveIndex);
  const chess = applyUciMoves(puzzle.fen, movesSoFar);
  const fen = chess.fen();
  return { fen, toMove: fen.split(" ")[1] as "w" | "b" };
}

export interface PuzzleForClient {
  puzzleId: string;
  fen: string;
  toMove: "w" | "b";
  rating: number;
  totalMoves: number;
}

/**
 * Picks a puzzle for `motif` the user hasn't already attempted (per their
 * saved history for that motif), and returns just enough to render it —
 * never the solution, since grading happens server-side in
 * attemptPuzzleMove.
 */
export async function pickPuzzleForUser(
  username: string,
  motif: string,
  options: { minRating?: number; maxRating?: number } = {},
): Promise<PuzzleForClient | undefined> {
  const history = await getPuzzleAttemptHistory(username, motif);
  const excludeIds = [...new Set(history.map((r) => r.puzzleId))];

  const puzzle = findRandomPuzzleByTheme(motif, { ...options, excludeIds });
  if (!puzzle) return undefined;

  const { fen, toMove } = getPuzzlePosition(puzzle, 0);
  return { puzzleId: puzzle.id, fen, toMove, rating: puzzle.rating, totalMoves: totalSolvingMoves(puzzle) };
}

export interface AttemptPuzzleMoveInput {
  username: string;
  motif: string;
  puzzleId: string;
  moveIndex: number;
  from: string;
  to: string;
  promotion?: string;
}

export interface AttemptPuzzleMoveResult {
  correct: boolean;
  /** True once this attempt was correct and was the puzzle's final solving move. */
  solved: boolean;
  /** Position after this attempt (and the opponent's auto-played reply, if any) — unchanged from before the attempt when incorrect, since a wrong move is never applied. */
  fenAfter: string;
  /** SAN of the opponent's forced reply, auto-played when the attempt was correct and the puzzle isn't solved yet. */
  opponentReplySan?: string;
  /** moveIndex to submit next (unchanged when incorrect — try again from the same position). */
  nextMoveIndex: number;
}

/**
 * Grades one candidate move against a puzzle's known solution. Always
 * re-derives the authoritative position server-side from the puzzle id +
 * moveIndex rather than trusting a client-supplied FEN, so the client
 * never needs (and is never sent) the solution array.
 */
export async function attemptPuzzleMove(
  input: AttemptPuzzleMoveInput,
): Promise<AttemptPuzzleMoveResult> {
  const puzzle = getPuzzleById(input.puzzleId);
  if (!puzzle) {
    throw new PuzzleNotFoundError(`No puzzle with id ${input.puzzleId}`);
  }

  const total = totalSolvingMoves(puzzle);
  if (input.moveIndex < 0 || input.moveIndex >= total) {
    throw new PuzzleAlreadyCompleteError(
      `Puzzle ${input.puzzleId} has no solving move at index ${input.moveIndex}`,
    );
  }

  const { fen: fenBefore } = getPuzzlePosition(puzzle, input.moveIndex);
  const chess = new Chess(fenBefore);

  let move;
  try {
    move = chess.move({ from: input.from, to: input.to, promotion: input.promotion });
  } catch {
    throw new IllegalPuzzleMoveError(
      `${toUci(input.from, input.to, input.promotion)} is not a legal move from this position`,
    );
  }

  const expectedUci = puzzle.moves[1 + 2 * input.moveIndex];
  const correct = toUci(move.from, move.to, move.promotion) === expectedUci;

  if (!correct) {
    await appendPuzzleAttempt(input.username, input.motif, {
      timestamp: new Date().toISOString(),
      puzzleId: puzzle.id,
      rating: puzzle.rating,
      correct: false,
      solved: false,
    });
    return { correct: false, solved: false, fenAfter: fenBefore, nextMoveIndex: input.moveIndex };
  }

  const nextMoveIndex = input.moveIndex + 1;
  const solved = nextMoveIndex >= total;

  let opponentReplySan: string | undefined;
  const replyUci = puzzle.moves[2 + 2 * input.moveIndex];
  if (!solved && replyUci) {
    const reply = chess.move({
      from: replyUci.slice(0, 2),
      to: replyUci.slice(2, 4),
      promotion: replyUci.slice(4) || undefined,
    });
    opponentReplySan = reply.san;
  }

  await appendPuzzleAttempt(input.username, input.motif, {
    timestamp: new Date().toISOString(),
    puzzleId: puzzle.id,
    rating: puzzle.rating,
    correct: true,
    solved,
  });

  return { correct: true, solved, fenAfter: chess.fen(), opponentReplySan, nextMoveIndex };
}
