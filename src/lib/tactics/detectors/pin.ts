import { Square } from "chess.js";
import { MoveContext, PIECE_VALUES } from "../context";
import { castRay, directionsFor, findRelativePin, RAY_PIECE_TYPES } from "../rays";

export interface PinResult {
  motif: "pin";
  pinnerSquare: Square;
  pinnedSquare: Square;
  behindSquare: Square;
}

/**
 * Ported from chess_detect's PinDetector. A pin is a ray piece attacking an
 * enemy piece with a more valuable piece (or the king) directly behind it
 * on the same line — the pinned piece can't safely move off the line.
 * Covers absolute pins (behind = king), relative pins (behind is more
 * valuable), and equal-value pins where a second attacker adds real
 * pressure (skipped if that's already a plain relative pin, to avoid
 * double-counting with exploiting-pin).
 */
export function detectPin(ctx: MoveContext): PinResult | undefined {
  const piece = ctx.movedPiece;
  if (!piece || !RAY_PIECE_TYPES.includes(piece.type)) return undefined;

  const toSquare = ctx.move.to;
  const defenderColor = ctx.opponentColor;
  const attackerValue = PIECE_VALUES[piece.type];
  const directions = directionsFor(piece.type);

  for (const direction of directions) {
    const onRay = castRay(ctx.boardAfter, toSquare, direction, 2);
    if (onRay.length < 2) continue;

    const [{ square: firstSquare, piece: firstPiece }, { square: secondSquare, piece: secondPiece }] =
      onRay;
    if (firstPiece.color !== defenderColor || secondPiece.color !== defenderColor) continue;

    const firstValue = PIECE_VALUES[firstPiece.type];
    const secondValue = PIECE_VALUES[secondPiece.type];
    const isAbsolutePin = secondPiece.type === "k";

    const pinnerCanBeTakenFreely = () => {
      if (!ctx.boardAfter.attackers(toSquare, defenderColor).includes(firstSquare)) return false;
      const pinnerDefended = ctx.boardAfter.isAttacked(toSquare, ctx.movingColor);
      return !pinnerDefended || firstValue <= attackerValue;
    };

    if (isAbsolutePin) {
      if (pinnerCanBeTakenFreely()) continue;
      return { motif: "pin", pinnerSquare: toSquare, pinnedSquare: firstSquare, behindSquare: secondSquare };
    }

    if (secondValue > firstValue) {
      if (ctx.movedPieceIsHanging) continue;
      if (pinnerCanBeTakenFreely()) continue;

      const secondIsDefended = ctx.boardAfter.isAttacked(secondSquare, defenderColor);
      if (secondIsDefended && attackerValue >= secondValue) continue;

      return { motif: "pin", pinnerSquare: toSquare, pinnedSquare: firstSquare, behindSquare: secondSquare };
    }

    if (secondValue === firstValue && firstValue > 1) {
      if (ctx.movedPieceIsHanging) continue;
      if (pinnerCanBeTakenFreely()) continue;

      const ourAttackers = ctx.boardAfter.attackers(firstSquare, ctx.movingColor);
      const otherAttackers = ourAttackers.filter((sq) => sq !== toSquare);
      if (otherAttackers.length === 0) continue;

      const relPin = findRelativePin(ctx.boardAfter, firstSquare, ctx.movingColor, toSquare);
      if (relPin !== undefined) continue;

      return { motif: "pin", pinnerSquare: toSquare, pinnedSquare: firstSquare, behindSquare: secondSquare };
    }
  }

  return undefined;
}
