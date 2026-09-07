import { Chess, Color, Piece, PieceSymbol, Square } from "chess.js";
import { PIECE_VALUES } from "./context";

export type Direction = readonly [df: number, dr: number];

export const BISHOP_DIRECTIONS: Direction[] = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];
export const ROOK_DIRECTIONS: Direction[] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];
export const QUEEN_DIRECTIONS: Direction[] = [...BISHOP_DIRECTIONS, ...ROOK_DIRECTIONS];

export const RAY_PIECE_TYPES: PieceSymbol[] = ["b", "r", "q"];

function fileOf(square: Square): number {
  return square.charCodeAt(0) - "a".charCodeAt(0);
}
function rankOf(square: Square): number {
  return square.charCodeAt(1) - "1".charCodeAt(0);
}
function toSquare(file: number, rank: number): Square {
  return (String.fromCharCode("a".charCodeAt(0) + file) + (rank + 1)) as Square;
}

export interface RayHit {
  square: Square;
  piece: Piece;
}

/** Casts a ray from `start` (exclusive) in `direction`, collecting occupied squares in order, up to `limit` (0 = no limit). */
export function castRay(chess: Chess, start: Square, direction: Direction, limit = 0): RayHit[] {
  const hits: RayHit[] = [];
  let file = fileOf(start) + direction[0];
  let rank = rankOf(start) + direction[1];

  while (file >= 0 && file < 8 && rank >= 0 && rank < 8) {
    const square = toSquare(file, rank);
    const piece = chess.get(square);
    if (piece) {
      hits.push({ square, piece });
      if (limit && hits.length >= limit) break;
    }
    file += direction[0];
    rank += direction[1];
  }

  return hits;
}

/** Empty squares strictly between `start` (exclusive) and `end` (exclusive) along `direction`. */
export function squaresBetween(start: Square, end: Square, direction: Direction): Square[] {
  const squares: Square[] = [];
  let file = fileOf(start) + direction[0];
  let rank = rankOf(start) + direction[1];

  while (file >= 0 && file < 8 && rank >= 0 && rank < 8) {
    const square = toSquare(file, rank);
    if (square === end) break;
    squares.push(square);
    file += direction[0];
    rank += direction[1];
  }

  return squares;
}

export function directionsFor(pieceType: PieceSymbol): Direction[] {
  if (pieceType === "b") return BISHOP_DIRECTIONS;
  if (pieceType === "r") return ROOK_DIRECTIONS;
  return QUEEN_DIRECTIONS;
}

/**
 * A piece is vulnerable if it's hanging, or can be captured by a cheaper
 * enemy piece (an unfavorable trade even if defended).
 */
export function isPieceVulnerable(chess: Chess, square: Square): boolean {
  const piece = chess.get(square);
  if (!piece) return false;

  const enemy: Color = piece.color === "w" ? "b" : "w";
  const attackers = chess.attackers(square, enemy);
  if (attackers.length === 0) return false;

  const defenders = chess.attackers(square, piece.color);
  if (defenders.length === 0) return true;

  const pieceValue = PIECE_VALUES[piece.type];
  for (const attackerSquare of attackers) {
    const attacker = chess.get(attackerSquare);
    if (attacker && attacker.type !== "k" && PIECE_VALUES[attacker.type] < pieceValue) {
      return true;
    }
  }

  return false;
}

/**
 * Looks for a relative pin on the piece at `targetSquare`: a ray piece of
 * `pinnerSide` behind it, and a more valuable same-color piece in front of
 * it along the same line. `excludeSquare` skips a square when searching for
 * the pinner (e.g. a piece that just moved there).
 */
export function findRelativePin(
  chess: Chess,
  targetSquare: Square,
  pinnerSide: Color,
  excludeSquare?: Square,
): { pinnerSquare: Square; behindSquare: Square; behindPiece: Piece } | undefined {
  const target = chess.get(targetSquare);
  if (!target) return undefined;
  const targetValue = PIECE_VALUES[target.type];

  for (const direction of QUEEN_DIRECTIONS) {
    const backward: Direction = [-direction[0], -direction[1]];

    const behind = castRay(chess, targetSquare, backward, 1);
    if (behind.length === 0) continue;
    const { square: pinnerSquare, piece: pinner } = behind[0];
    if (excludeSquare !== undefined && pinnerSquare === excludeSquare) continue;
    if (pinner.color !== pinnerSide) continue;
    if (!RAY_PIECE_TYPES.includes(pinner.type)) continue;
    if (pinner.type === "b" && !BISHOP_DIRECTIONS.includes(direction)) continue;
    if (pinner.type === "r" && !ROOK_DIRECTIONS.includes(direction)) continue;

    const forward = castRay(chess, targetSquare, direction, 1);
    if (forward.length === 0) continue;
    const { square: behindSquare, piece: behindPiece } = forward[0];
    if (behindPiece.color !== target.color) continue;
    const behindValue = PIECE_VALUES[behindPiece.type];
    if (behindValue <= targetValue) continue;

    return { pinnerSquare, behindSquare, behindPiece };
  }

  return undefined;
}
