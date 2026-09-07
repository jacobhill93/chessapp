import { Square } from "chess.js";
import { getPieceValueAt, MoveContext, PIECE_VALUES } from "../context";
import { castRay, directionsFor, isPieceVulnerable, RAY_PIECE_TYPES, squaresBetween } from "../rays";

export interface SkewerResult {
  motif: "skewer";
  attackerSquare: Square;
  frontSquare: Square;
  backSquare: Square;
}

/**
 * Ported from chess_detect's SkewerDetector. A skewer is the reverse of a
 * pin: a ray piece attacks a valuable target with a less valuable piece
 * behind it — the front piece is forced to move (it's the king, or moving
 * it is simply better than losing it), exposing the back piece to capture.
 * Checks the attacker isn't itself hanging, the back piece can't just be
 * defended after the front piece moves, and (for non-royal skewers) that
 * the ray can't be blocked.
 */
export function detectSkewer(ctx: MoveContext): SkewerResult | undefined {
  const piece = ctx.movedPiece;
  if (!piece || !RAY_PIECE_TYPES.includes(piece.type)) return undefined;

  const toSquare = ctx.move.to;
  const defenderColor = ctx.opponentColor;
  const skewerValue = PIECE_VALUES[piece.type];
  const directions = directionsFor(piece.type);

  for (const direction of directions) {
    const onRay = castRay(ctx.boardAfter, toSquare, direction, 2);
    if (onRay.length < 2) continue;

    const [{ square: frontSquare, piece: frontPiece }, { square: backSquare, piece: backPiece }] = onRay;
    if (frontPiece.color !== defenderColor || backPiece.color !== defenderColor) continue;

    const frontValue = getPieceValueAt(ctx, frontSquare);
    const backValue = getPieceValueAt(ctx, backSquare);
    const isRoyalSkewer = frontPiece.type === "k";

    if (isRoyalSkewer) {
      if (isPieceVulnerable(ctx.boardAfter, toSquare)) continue;

      if (skewerValue >= backValue) {
        const backDefenders = ctx.boardAfter.attackers(backSquare, defenderColor);
        if (backDefenders.length > 0) continue;
      }

      return { motif: "skewer", attackerSquare: toSquare, frontSquare, backSquare };
    }

    const isEqualAndVulnerable = frontValue === backValue && isPieceVulnerable(ctx.boardAfter, frontSquare);
    if (frontValue > backValue || isEqualAndVulnerable) {
      if (ctx.movedPieceIsHanging) continue;

      if (skewerValue >= backValue) {
        const backDefenders = ctx.boardAfter.attackers(backSquare, defenderColor);
        if (backDefenders.length > 0) continue;
      }

      const between = squaresBetween(toSquare, frontSquare, direction);
      if (between.length > 0) {
        const betweenSet = new Set(between);
        const canBlock = ctx.boardAfter
          .moves({ verbose: true })
          .some((m) => betweenSet.has(m.to) && m.from !== frontSquare);
        if (canBlock) continue;
      }

      return { motif: "skewer", attackerSquare: toSquare, frontSquare, backSquare };
    }
  }

  return undefined;
}
