"use client";

import { Chess, Square } from "chess.js";
import { Piece, PieceType } from "./pieces";
import styles from "./Board.module.css";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = [8, 7, 6, 5, 4, 3, 2, 1];

export interface BoardMove {
  from: string;
  to: string;
}

export interface BoardProps {
  fen: string;
  lastMove?: BoardMove;
  hintMove?: BoardMove;
  flipped?: boolean;
}

function findKingSquare(chess: Chess, color: "w" | "b"): Square | null {
  const board = chess.board();
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const piece = board[r][f];
      if (piece && piece.type === "k" && piece.color === color) {
        return `${FILES[f]}${8 - r}` as Square;
      }
    }
  }
  return null;
}

export function Board({ fen, lastMove, hintMove, flipped = false }: BoardProps) {
  const chess = new Chess(fen);
  const board = chess.board();
  const checkedKingSquare = chess.inCheck() ? findKingSquare(chess, chess.turn()) : null;

  const ranks = flipped ? [...RANKS].reverse() : RANKS;
  const files = flipped ? [...FILES].reverse() : FILES;

  return (
    <div className={styles.board} role="grid" aria-label="Chess board">
      {ranks.map((rank, rowIndex) =>
        files.map((file, colIndex) => {
          const fileIndex = FILES.indexOf(file);
          const square = `${file}${rank}`;
          const isDark = (fileIndex + rank) % 2 !== 0;
          const piece = board[8 - rank][fileIndex];
          const isLastMove = lastMove && (square === lastMove.from || square === lastMove.to);
          const isCheck = square === checkedKingSquare;
          const isBottomRow = rowIndex === ranks.length - 1;
          const isLeftColumn = colIndex === 0;
          const occupant = piece
            ? `, ${piece.color === "w" ? "white" : "black"} ${PIECE_NAMES[piece.type as PieceType]}`
            : "";

          return (
            <div
              key={square}
              role="gridcell"
              aria-label={`${square}${occupant}`}
              className={`${styles.square} ${isDark ? styles.dark : styles.light}`}
            >
              {isLastMove && <div className={styles.lastMove} />}
              {isCheck && <div className={styles.check} />}
              {isLeftColumn && <span className={styles.rankLabel}>{rank}</span>}
              {isBottomRow && <span className={styles.fileLabel}>{file}</span>}
              {piece && (
                <Piece
                  type={piece.type as PieceType}
                  color={piece.color}
                  className={styles.piece}
                />
              )}
            </div>
          );
        }),
      )}
      {hintMove && (
        <BestMoveArrow move={hintMove} flipped={flipped} />
      )}
    </div>
  );
}

const PIECE_NAMES: Record<PieceType, string> = {
  k: "king",
  q: "queen",
  r: "rook",
  b: "bishop",
  n: "knight",
  p: "pawn",
};

function squareCenter(square: string, flipped: boolean): { x: number; y: number } {
  const file = FILES.indexOf(square[0]);
  const rank = Number(square[1]);
  const col = flipped ? 7 - file : file;
  const row = flipped ? rank - 1 : 8 - rank;
  return { x: col + 0.5, y: row + 0.5 };
}

function BestMoveArrow({ move, flipped }: { move: BoardMove; flipped: boolean }) {
  const from = squareCenter(move.from, flipped);
  const to = squareCenter(move.to, flipped);

  return (
    <svg className={styles.arrowLayer} viewBox="0 0 8 8">
      <defs>
        <marker
          id="best-move-arrowhead"
          markerWidth="2.4"
          markerHeight="2.4"
          refX="1.5"
          refY="1.2"
          orient="auto"
        >
          <path d="M0,0 L2.4,1.2 L0,2.4 z" fill="var(--ocher-500)" />
        </marker>
      </defs>
      <line
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        stroke="var(--ocher-500)"
        strokeWidth="0.12"
        strokeOpacity="0.7"
        strokeLinecap="round"
        markerEnd="url(#best-move-arrowhead)"
      />
    </svg>
  );
}
