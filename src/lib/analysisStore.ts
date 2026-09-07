import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { analyzeGame, DEFAULT_ANALYSIS_DEPTH, GameAnalysis } from "./analysis";
import type { ParsedGame } from "./gameParser";

const DATA_DIR = path.join(process.cwd(), "data", "analysis");

function cacheFilePath(username: string, uuid: string, depth: number) {
  return path.join(DATA_DIR, username.toLowerCase(), `${uuid}-d${depth}.json`);
}

/**
 * Analyzes every move of a game with Stockfish, caching the result to disk
 * per (game, depth) — a deeper re-analysis is a cache miss, since it isn't
 * equivalent to a shallower one.
 */
export async function getGameAnalysis(
  username: string,
  parsed: ParsedGame,
  options: { depth?: number } = {},
): Promise<GameAnalysis> {
  const depth = options.depth ?? DEFAULT_ANALYSIS_DEPTH;
  const filePath = cacheFilePath(username, parsed.uuid, depth);

  try {
    const cached = await readFile(filePath, "utf-8");
    return JSON.parse(cached) as GameAnalysis;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      throw err;
    }
  }

  const analysis = await analyzeGame(parsed, { depth });
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(analysis), "utf-8");
  return analysis;
}
