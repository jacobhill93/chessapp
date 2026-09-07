import { PieceSymbol, Square } from "chess.js";
import { buildMoveContext } from "./context";
import { detectBackRankMate } from "./detectors/backRank";
import { detectDiscoveredCheck } from "./detectors/discoveredCheck";
import { detectDoubleCheck } from "./detectors/doubleCheck";
import { detectFork } from "./detectors/fork";
import { detectPin } from "./detectors/pin";
import { detectSkewer } from "./detectors/skewer";

export type TacticMotif =
  | ReturnType<typeof detectFork>
  | ReturnType<typeof detectPin>
  | ReturnType<typeof detectSkewer>
  | ReturnType<typeof detectDiscoveredCheck>
  | ReturnType<typeof detectDoubleCheck>
  | ReturnType<typeof detectBackRankMate>;

/**
 * Runs every native tactic detector (Stage 9, Phase 1 — see CLAUDE.md's
 * motif coverage tracker for what is/isn't covered) against one played
 * move. A single move can trigger more than one detector (e.g. a
 * discovered check that also forks two pieces), so this returns all hits,
 * most concrete/specific first.
 */
export function detectTactics(
  fenBefore: string,
  from: Square,
  to: Square,
  promotion?: PieceSymbol,
): NonNullable<TacticMotif>[] {
  const ctx = buildMoveContext(fenBefore, from, to, promotion);

  const results = [
    detectDoubleCheck(ctx),
    detectDiscoveredCheck(ctx),
    detectFork(ctx),
    detectPin(ctx),
    detectSkewer(ctx),
    detectBackRankMate(ctx),
  ];

  return results.filter((r): r is NonNullable<typeof r> => r !== undefined);
}
