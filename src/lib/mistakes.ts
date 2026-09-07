import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  CLASSIFICATION_SEVERITY_ORDER,
  GameAnalysis,
  MoveAnalysis,
  MoveClassification,
} from "./analysis";
import { classifyMotif, Motif } from "./motif";

const DATA_DIR = path.join(process.cwd(), "data", "analysis");

export interface Mistake extends MoveAnalysis {
  uuid: string;
  depth: number;
  motif: Motif;
}

function meetsMinSeverity(
  classification: MoveClassification,
  minSeverity: MoveClassification,
): boolean {
  return (
    CLASSIFICATION_SEVERITY_ORDER.indexOf(classification) >=
    CLASSIFICATION_SEVERITY_ORDER.indexOf(minSeverity)
  );
}

/**
 * Lists flagged moves from games that have *already* been analyzed and
 * cached for this user (via GET /api/analysis) — this never triggers new
 * Stockfish analysis, since scanning a user's entire game history on
 * every request would be far too slow.
 */
export async function getMistakesForUser(
  username: string,
  options: { minSeverity?: MoveClassification } = {},
): Promise<Mistake[]> {
  const minSeverity = options.minSeverity ?? "mistake";
  const dir = path.join(DATA_DIR, username.toLowerCase());

  let files: string[];
  try {
    files = await readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }

  // A game may have been analyzed at more than one depth; prefer the deepest.
  const latestByUuid = new Map<string, { file: string; depth: number }>();
  for (const file of files) {
    const match = file.match(/^(.+)-d(\d+)\.json$/);
    if (!match) continue;
    const [, uuid, depthStr] = match;
    const depth = Number(depthStr);
    const existing = latestByUuid.get(uuid);
    if (!existing || depth > existing.depth) {
      latestByUuid.set(uuid, { file, depth });
    }
  }

  const mistakes: Mistake[] = [];
  for (const [uuid, { file, depth }] of latestByUuid) {
    const contents = await readFile(path.join(dir, file), "utf-8");
    const analysis = JSON.parse(contents) as GameAnalysis;

    analysis.moves.forEach((move, index) => {
      if (meetsMinSeverity(move.classification, minSeverity)) {
        const motif = classifyMotif(move, analysis.moves[index + 1]);
        mistakes.push({ ...move, uuid, depth, motif });
      }
    });
  }

  mistakes.sort((a, b) => b.centipawnLoss - a.centipawnLoss);
  return mistakes;
}
