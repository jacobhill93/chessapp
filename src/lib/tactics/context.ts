import { Chess, Color, Move, PieceSymbol, Square } from "chess.js";

/**
 * Ported from aslyamov/chess_detect's MoveContext (MIT license) — see
 * CLAUDE.md's Stage 9 notes for the source and rationale for porting rather
 * than depending on the Python package directly. Field names/semantics
 * mirror the original closely so the detector ports below stay a faithful
 * translation rather than a reinterpretation.
 */
export interface MoveContext {
  /** Position before the move (not mutated). */
  boardBefore: Chess;
  /** Position after the move. */
  boardAfter: Chess;
  move: Move;
  movingColor: Color;
  opponentColor: Color;
  /** Check after the move. */
  isCheck: boolean;
  /** Opponent's king square (the one potentially under attack after the move). */
  kingSquare: Square | undefined;
  /** Squares of moving-side pieces attacking the opponent king after the move. */
  attackersOnKing: Square[];
  attackersCount: number;
  movedPiece: { type: PieceSymbol; color: Color } | undefined;
  /** Occupied squares the moved piece attacks after the move. */
  pieceAttacks: Square[];
  capturedPiece: { type: PieceSymbol; color: Color } | undefined;
  isCapture: boolean;
  movedPieceIsAttacked: boolean;
  movedPieceIsDefended: boolean;
  /** Attacked and not defended — the opponent can take it for free. */
  movedPieceIsHanging: boolean;
}

/** Squares occupied on `chess` that a piece sitting on `from` attacks. */
export function squaresAttackedFrom(chess: Chess, from: Square): Square[] {
  const piece = chess.get(from);
  if (!piece) return [];
  const result: Square[] = [];
  for (const row of chess.board()) {
    for (const cell of row) {
      if (!cell || cell.square === from) continue;
      if (chess.attackers(cell.square, piece.color).includes(from)) {
        result.push(cell.square);
      }
    }
  }
  return result;
}

export function isSquareDefendedBy(chess: Chess, square: Square, color: Color): boolean {
  return chess.isAttacked(square, color);
}

/**
 * Builds a MoveContext from a move already known to have been played,
 * given the FEN before and the from/to/promotion of the move. We already
 * have fenBefore/fenAfter/from/to on every ParsedMove, so unlike the
 * Python original (which starts from a board + un-applied move) we load
 * both positions directly rather than replaying — cheaper and avoids
 * hand-rolling en passant/castle bookkeeping since chess.js's Move object
 * already carries it.
 */
export function buildMoveContext(
  fenBefore: string,
  from: Square,
  to: Square,
  promotion?: PieceSymbol,
): MoveContext {
  const boardBefore = new Chess(fenBefore);
  const scratch = new Chess(fenBefore);
  const move = scratch.move({ from, to, promotion });
  const boardAfter = scratch;

  const movingColor = move.color;
  const opponentColor: Color = movingColor === "w" ? "b" : "w";
  const isCheck = boardAfter.isCheck();
  const kingSquare = findKing(boardAfter, opponentColor);
  const attackersOnKing = kingSquare ? boardAfter.attackers(kingSquare, movingColor) : [];
  const movedPiece = boardAfter.get(to);
  const pieceAttacks = squaresAttackedFrom(boardAfter, to);
  const capturedPiece = move.captured ? { type: move.captured, color: opponentColor } : undefined;
  const movedPieceIsAttacked = isSquareDefendedBy(boardAfter, to, opponentColor);
  const movedPieceIsDefended = isSquareDefendedBy(boardAfter, to, movingColor);

  return {
    boardBefore,
    boardAfter,
    move,
    movingColor,
    opponentColor,
    isCheck,
    kingSquare,
    attackersOnKing,
    attackersCount: attackersOnKing.length,
    movedPiece,
    pieceAttacks,
    capturedPiece,
    isCapture: capturedPiece !== undefined,
    movedPieceIsAttacked,
    movedPieceIsDefended,
    movedPieceIsHanging: movedPieceIsAttacked && !movedPieceIsDefended,
  };
}

function findKing(chess: Chess, color: Color): Square | undefined {
  for (const row of chess.board()) {
    for (const cell of row) {
      if (cell && cell.type === "k" && cell.color === color) return cell.square;
    }
  }
  return undefined;
}

export function getPieceValueAt(ctx: MoveContext, square: Square): number {
  const piece = ctx.boardAfter.get(square);
  return piece ? PIECE_VALUES[piece.type] : 0;
}

export function isSquareDefended(ctx: MoveContext, square: Square): boolean {
  return isSquareDefendedBy(ctx.boardAfter, square, ctx.opponentColor);
}

export const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 100,
};
