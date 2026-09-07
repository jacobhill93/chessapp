import type { MoveClassification } from "./analysis";
import { getDrillHistory } from "./drill";
import { getMistakesForUser } from "./mistakes";
import { MOTIF_LABELS, Motif } from "./motif";

export interface MotifSummary {
  motif: Motif;
  label: string;
  count: number;
  avgCentipawnLoss: number;
  drilledCount: number;
  resolvedCount: number;
}

/**
 * Tallies flagged mistakes by motif for a user — a simple count per motif,
 * not a time-series/trend tracker. "Drilled" counts mistakes with at least
 * one recorded attempt (see src/lib/drill.ts); "resolved" counts those
 * whose most recent attempt came back "best" or "good".
 */
export async function getWeakSpotSummary(
  username: string,
  options: { minSeverity?: MoveClassification } = {},
): Promise<MotifSummary[]> {
  const mistakes = await getMistakesForUser(username, options);

  // Resolve drill status for every mistake first (concurrently, side-effect
  // free), then aggregate in a plain synchronous loop below — aggregating
  // inside the async map itself would race, since two mistakes sharing a
  // motif could both read the same not-yet-inserted tally before either
  // writes it back, silently dropping one of the updates.
  const drillStatuses = await Promise.all(
    mistakes.map(async (mistake) => {
      const history = await getDrillHistory(username, mistake.uuid, mistake.ply);
      const latest = history.attempts[history.attempts.length - 1];
      return {
        drilled: history.attempts.length > 0,
        resolved: latest
          ? latest.classification === "best" || latest.classification === "good"
          : false,
      };
    }),
  );

  const byMotif = new Map<
    Motif,
    { count: number; totalCpLoss: number; drilled: number; resolved: number }
  >();

  mistakes.forEach((mistake, index) => {
    const status = drillStatuses[index];
    const entry = byMotif.get(mistake.motif) ?? {
      count: 0,
      totalCpLoss: 0,
      drilled: 0,
      resolved: 0,
    };

    entry.count += 1;
    entry.totalCpLoss += mistake.centipawnLoss;
    if (status.drilled) entry.drilled += 1;
    if (status.resolved) entry.resolved += 1;

    byMotif.set(mistake.motif, entry);
  });

  return [...byMotif.entries()]
    .map(([motif, stats]) => ({
      motif,
      label: MOTIF_LABELS[motif],
      count: stats.count,
      avgCentipawnLoss: Math.round(stats.totalCpLoss / stats.count),
      drilledCount: stats.drilled,
      resolvedCount: stats.resolved,
    }))
    .sort((a, b) => b.count - a.count);
}
