"use client";

import { useState } from "react";
import { Chess, Move, Square } from "chess.js";
import { Piece, PieceType } from "./pieces";
import styles from "./Board.module.css";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = [8, 7, 6, 5, 4, 3, 2, 1];

export type PromotionPieceType = "q" | "r" | "b" | "n";
const PROMOTION_CHOICES: PromotionPieceType[] = ["q", "r", "b", "n"];

export interface BoardMove {
  from: string;
  to: string;
}

export interface BoardProps {
  fen: string;
  lastMove?: BoardMove;
  hintMove?: BoardMove;
  flipped?: boolean;
  /** Enables click-to-move input. Off by default so existing read-only usages (game review) are unaffected. */
  interactive?: boolean;
  onMove?: (from: string, to: string, promotion?: PromotionPieceType) => void;
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

export function Board({
  fen,
  lastMove,
  hintMove,
  flipped = false,
  interactive = false,
  onMove,
}: BoardProps) {
  const chess = new Chess(fen);
  const board = chess.board();
  const checkedKingSquare = chess.inCheck() ? findKingSquare(chess, chess.turn()) : null;

  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{
    from: Square;
    to: Square;
    color: "w" | "b";
  } | null>(null);

  // A new position (ours or the opponent's) invalidates any in-progress
  // selection. Reset during render rather than in an effect (React's
  // "adjusting state when a prop changes" pattern) so there's no
  // stale-selection frame before the reset commits.
  const [prevFen, setPrevFen] = useState(fen);
  if (fen !== prevFen) {
    setPrevFen(fen);
    setSelectedSquare(null);
    setPendingPromotion(null);
  }

  const legalMoves: Move[] =
    interactive && selectedSquare ? chess.moves({ square: selectedSquare, verbose: true }) : [];
  const destinationsByTo = new Map<string, Move[]>();
  for (const move of legalMoves) {
    const existing = destinationsByTo.get(move.to);
    if (existing) existing.push(move);
    else destinationsByTo.set(move.to, [move]);
  }

  function handleSquareClick(square: Square) {
    if (!interactive || pendingPromotion) return;

    if (selectedSquare) {
      const candidates = destinationsByTo.get(square);
      if (candidates && candidates.length > 0) {
        if (candidates.length > 1) {
          setPendingPromotion({ from: selectedSquare, to: square, color: chess.turn() });
        } else {
          onMove?.(selectedSquare, square, candidates[0].promotion as PromotionPieceType | undefined);
        }
        setSelectedSquare(null);
        return;
      }

      if (square === selectedSquare) {
        setSelectedSquare(null);
        return;
      }
    }

    const piece = chess.get(square);
    setSelectedSquare(piece && piece.color === chess.turn() ? square : null);
  }

  function choosePromotion(promotion: PromotionPieceType) {
    if (!pendingPromotion) return;
    onMove?.(pendingPromotion.from, pendingPromotion.to, promotion);
    setPendingPromotion(null);
  }

  const ranks = flipped ? [...RANKS].reverse() : RANKS;
  const files = flipped ? [...FILES].reverse() : FILES;

  return (
    <div className={styles.board} role="grid" aria-label="Chess board">
      {ranks.map((rank, rowIndex) =>
        files.map((file, colIndex) => {
          const fileIndex = FILES.indexOf(file);
          const square = `${file}${rank}` as Square;
          const isDark = (fileIndex + rank) % 2 !== 0;
          const piece = board[8 - rank][fileIndex];
          const isLastMove = lastMove && (square === lastMove.from || square === lastMove.to);
          const isCheck = square === checkedKingSquare;
          const isBottomRow = rowIndex === ranks.length - 1;
          const isLeftColumn = colIndex === 0;
          const isSelected = square === selectedSquare;
          const destinationCandidates = destinationsByTo.get(square);
          const isLegalDestination = interactive && !!destinationCandidates;
          // A destination counts as a "capture" square even when empty (en passant).
          const isLegalCapture =
            isLegalDestination && destinationCandidates!.some((move) => move.captured);
          const isClickable =
            interactive &&
            (isLegalDestination || (piece !== null && piece.color === chess.turn()));
          const occupant = piece
            ? `, ${piece.color === "w" ? "white" : "black"} ${PIECE_NAMES[piece.type as PieceType]}`
            : "";

          return (
            <div
              key={square}
              role="gridcell"
              aria-label={`${square}${occupant}`}
              className={`${styles.square} ${isDark ? styles.dark : styles.light} ${
                isClickable ? styles.clickable : ""
              }`}
              onClick={interactive ? () => handleSquareClick(square) : undefined}
            >
              {isLastMove && <div className={styles.lastMove} />}
              {isCheck && <div className={styles.check} />}
              {isSelected && <div className={styles.selected} />}
              {isLegalDestination && !isLegalCapture && <div className={styles.legalDot} />}
              {isLegalCapture && <div className={styles.legalCapture} />}
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
      {pendingPromotion && (
        <PromotionPicker color={pendingPromotion.color} onChoose={choosePromotion} />
      )}
    </div>
  );
}

function PromotionPicker({
  color,
  onChoose,
}: {
  color: "w" | "b";
  onChoose: (promotion: PromotionPieceType) => void;
}) {
  return (
    <div className={styles.promotionOverlay}>
      <div className={styles.promotionPanel} role="menu" aria-label="Choose promotion piece">
        {PROMOTION_CHOICES.map((type) => (
          <button
            key={type}
            type="button"
            role="menuitem"
            className={styles.promotionChoice}
            aria-label={`Promote to ${PIECE_NAMES[type]}`}
            onClick={() => onChoose(type)}
          >
            <Piece type={type} color={color} className={styles.promotionPiece} />
          </button>
        ))}
      </div>
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
