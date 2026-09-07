import { Chess, Square } from "chess.js";
import { getPieceValueAt, isSquareDefended, MoveContext, PIECE_VALUES } from "../context";

export interface ForkResult {
  motif: "fork";
  forkerSquare: Square;
  targetSquares: Square[];
}

/**
 * Ported from chess_detect's ForkDetector. A fork is a piece attacking 2+
 * valuable targets at once. A target counts as valuable if it's the king,
 * worth more than the attacker, equal value but undefended, or hanging
 * outright. Also checks the fork itself doesn't just hang for a losing
 * trade, and (for non-check forks) that the opponent can't save both
 * targets by moving the cheaper one somewhere that defends the other.
 */
export function detectFork(ctx: MoveContext): ForkResult | undefined {
  const piece = ctx.movedPiece;
  if (!piece) return undefined;

  const attackerValue = PIECE_VALUES[piece.type];
  const attackedValuable: Square[] = [];
  let hasKingAttack = false;

  for (const targetSquare of ctx.pieceAttacks) {
    const target = ctx.boardAfter.get(targetSquare);
    if (!target || target.color === ctx.movingColor) continue;

    const targetValue = getPieceValueAt(ctx, targetSquare);

    if (target.type === "k") {
      attackedValuable.push(targetSquare);
      hasKingAttack = true;
    } else if (target.type !== "p" && targetValue > attackerValue) {
      attackedValuable.push(targetSquare);
    } else if (
      target.type !== "p" &&
      targetValue === attackerValue &&
      !isSquareDefended(ctx, targetSquare)
    ) {
      attackedValuable.push(targetSquare);
    } else if (!isSquareDefended(ctx, targetSquare)) {
      attackedValuable.push(targetSquare);
    }
  }

  if (attackedValuable.length < 2) return undefined;

  // A fork that doesn't check and hangs the forker is just a free piece for the opponent.
  if (!hasKingAttack && ctx.movedPieceIsHanging) return undefined;

  const toSquare = ctx.move.to;
  const captureReplies = ctx.boardAfter.moves({ verbose: true }).filter((m) => m.to === toSquare);
  for (const reply of captureReplies) {
    const attacker = ctx.boardAfter.get(reply.from);
    if (!attacker || attacker.type === "k") continue;
    const attackerReplyValue = PIECE_VALUES[attacker.type];

    if (!ctx.movedPieceIsDefended) return undefined;
    if (attackerReplyValue <= attackerValue) return undefined;
  }

  // Non-check fork: can the opponent move the cheapest target away while it defends the other(s)?
  if (!hasKingAttack) {
    const cheapestSquare = attackedValuable.reduce((min, sq) =>
      getPieceValueAt(ctx, sq) < getPieceValueAt(ctx, min) ? sq : min,
    );
    const cheapestValue = getPieceValueAt(ctx, cheapestSquare);

    if (cheapestValue <= attackerValue) {
      for (const escapeSquare of attackedValuable) {
        if (escapeSquare === cheapestSquare) continue;
        const escapeMoves = ctx.boardAfter.moves({ verbose: true, square: escapeSquare });
        for (const escapeMove of escapeMoves) {
          const clone = new Chess(ctx.boardAfter.fen());
          clone.move({ from: escapeMove.from, to: escapeMove.to, promotion: escapeMove.promotion });
          const defended = clone.isAttacked(cheapestSquare, ctx.opponentColor);
          if (defended) return undefined;
        }
      }
    }
  }

  return { motif: "fork", forkerSquare: toSquare, targetSquares: attackedValuable };
}
