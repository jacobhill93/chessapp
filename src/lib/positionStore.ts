import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ChessComGame } from "./chesscom";
import { parseGame, ParsedGame } from "./gameParser";

const DATA_DIR = path.join(process.cwd(), "data", "positions");

function cacheFilePath(username: string, uuid: string) {
  return path.join(DATA_DIR, username.toLowerCase(), `${uuid}.json`);
}

/** Parses a game's PGN into positions/moves, caching the result to disk. */
export async function getParsedGame(
  username: string,
  game: ChessComGame,
): Promise<ParsedGame> {
  const filePath = cacheFilePath(username, game.uuid);

  try {
    const cached = await readFile(filePath, "utf-8");
    return JSON.parse(cached) as ParsedGame;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      throw err;
    }
  }

  const parsed = parseGame(game);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(parsed), "utf-8");
  return parsed;
}
