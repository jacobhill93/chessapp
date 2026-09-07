import { Chess } from "chess.js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  classifyMove,
  MoveClassification,
  scoreToCentipawns,
} from "./analysis";
import { getGameAnalysis } from "./analysisStore";
import { getGamesForUser } from "./gameStore";
import { getParsedGame } from "./positionStore";
import { EngineScore, evaluatePosition } from "./stockfish";

export class MistakeNotFoundError extends Error {}
export class IllegalMoveError extends Error {}

export interface DrillAttempt {
  timestamp: string;
  from: string;
  to: string;
  promotion?: string;
  san: string;
  centipawnLoss: number;
  classification: MoveClassification;
  /** Whether this attempt matched Stockfish's top choice from this position. */
  foundBestMove: boolean;
  /** Whether this attempt was better than the move originally played (that made this a flagged mistake). */
  improved: boolean;
  evalAfter: EngineScore | null;
}

export interface DrillHistory {
  uuid: string;
  ply: number;
  attempts: DrillAttempt[];
}

const DATA_DIR = path.join(process.cwd(), "data", "drills");

function historyFilePath(username: string, uuid: string, ply: number) {
  return path.join(DATA_DIR, username.toLowerCase(), `${uuid}-ply${ply}.json`);
}

export async function getDrillHistory(
  username: string,
  uuid: string,
  ply: number,
): Promise<DrillHistory> {
  try {
    const contents = await readFile(historyFilePath(username, uuid, ply), "utf-8");
    return JSON.parse(contents) as DrillHistory;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    return { uuid, ply, attempts: [] };
  }
}

async function appendDrillAttempt(
  username: string,
  uuid: string,
  ply: number,
  attempt: DrillAttempt,
): Promise<void> {
  const history = await getDrillHistory(username, uuid, ply);
  history.attempts.push(attempt);

  const filePath = historyFilePath(username, uuid, ply);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(history), "utf-8");
}

export interface AttemptMoveInput {
  username: string;
  uuid: string;
  ply: number;
  from: string;
  to: string;
  promotion?: string;
  depth?: number;
}

/**
 * Replays a flagged mistake: validates the user's candidate move from the
 * position before their original mistake, evaluates the result with
 * Stockfish at the same depth as the original analysis (for a fair
 * comparison), and records the attempt to drill history either way.
 */
export async function attemptMove(input: AttemptMoveInput): Promise<DrillAttempt> {
  const games = await getGamesForUser(input.username);
  const game = games.find((g) => g.uuid === input.uuid);
  if (!game) {
    throw new MistakeNotFoundError(
      `No game with uuid ${input.uuid} found for ${input.username}`,
    );
  }

  const parsed = await getParsedGame(input.username, game);
  const analysis = await getGameAnalysis(input.username, parsed, {
    depth: input.depth,
  });
  const mistake = analysis.moves.find((m) => m.ply === input.ply);
  if (!mistake) {
    throw new MistakeNotFoundError(
      `No move at ply ${input.ply} in game ${input.uuid}`,
    );
  }

  const chess = new Chess(mistake.fenBefore);
  let move;
  try {
    move = chess.move({ from: input.from, to: input.to, promotion: input.promotion });
  } catch {
    throw new IllegalMoveError(
      `${input.from}${input.to}${input.promotion ?? ""} is not a legal move from this position`,
    );
  }

  const evaluation = await evaluatePosition(chess.fen(), { depth: analysis.depth });

  const moverSign = mistake.color === "w" ? 1 : -1;
  const evalBeforeForMover = scoreToCentipawns(mistake.evalBefore) * moverSign;
  const evalAfterForMover = scoreToCentipawns(evaluation.score) * moverSign;
  const centipawnLoss = Math.max(0, evalBeforeForMover - evalAfterForMover);
  const uciMove = `${input.from}${input.to}${input.promotion ?? ""}`;

  const attempt: DrillAttempt = {
    timestamp: new Date().toISOString(),
    from: input.from,
    to: input.to,
    promotion: input.promotion,
    san: move.san,
    centipawnLoss,
    classification: classifyMove(centipawnLoss),
    foundBestMove: uciMove === mistake.bestMove,
    improved: centipawnLoss < mistake.centipawnLoss,
    evalAfter: evaluation.score,
  };

  await appendDrillAttempt(input.username, input.uuid, input.ply, attempt);

  return attempt;
}
