import { Chess } from "chess.js";
import type { ChessComGame } from "./chesscom";

export interface ParsedMove {
  ply: number;
  moveNumber: number;
  color: "w" | "b";
  san: string;
  from: string;
  to: string;
  promotion?: string;
  fenBefore: string;
  fenAfter: string;
  clockSeconds: number | null;
}

export interface ParsedGame {
  uuid: string;
  moves: ParsedMove[];
}

const CLOCK_PATTERN = /\{\[%clk\s+([\d:.]+)\]\}/g;

function clockToSeconds(clock: string): number {
  const parts = clock.split(":").map(Number);
  const [hours, minutes, seconds] =
    parts.length === 3 ? parts : [0, parts[0], parts[1]];
  return hours * 3600 + minutes * 60 + seconds;
}

/** Extracts, in move order, the %clk annotations chess.com embeds in its PGN. */
function extractClockSeconds(pgn: string): number[] {
  return [...pgn.matchAll(CLOCK_PATTERN)].map((match) => clockToSeconds(match[1]));
}

export function parsePgn(pgn: string): ParsedMove[] {
  const clockSeconds = extractClockSeconds(pgn);

  const chess = new Chess();
  chess.loadPgn(pgn);

  return chess.history({ verbose: true }).map((move, index) => ({
    ply: index + 1,
    moveNumber: Math.floor(index / 2) + 1,
    color: move.color,
    san: move.san,
    from: move.from,
    to: move.to,
    promotion: move.promotion,
    fenBefore: move.before,
    fenAfter: move.after,
    clockSeconds: clockSeconds[index] ?? null,
  }));
}

export function parseGame(game: ChessComGame): ParsedGame {
  return { uuid: game.uuid, moves: parsePgn(game.pgn) };
}
