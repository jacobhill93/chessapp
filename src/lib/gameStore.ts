import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  ChessComGame,
  getArchiveUrls,
  getGamesFromArchive,
  parseArchiveMonth,
} from "./chesscom";

const DATA_DIR = path.join(process.cwd(), "data", "games");

function cacheFilePath(username: string, year: string, month: string) {
  return path.join(DATA_DIR, username.toLowerCase(), `${year}-${month}.json`);
}

async function readCachedMonth(
  username: string,
  year: string,
  month: string,
): Promise<ChessComGame[] | null> {
  try {
    const contents = await readFile(
      cacheFilePath(username, year, month),
      "utf-8",
    );
    return JSON.parse(contents) as ChessComGame[];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw err;
  }
}

async function writeCachedMonth(
  username: string,
  year: string,
  month: string,
  games: ChessComGame[],
): Promise<void> {
  const filePath = cacheFilePath(username, year, month);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(games), "utf-8");
}

/**
 * Returns all games chess.com has for a user, most recent first.
 * Every month except the current (still in-progress) one is immutable on
 * chess.com's side, so those are cached to disk and never re-fetched.
 */
export async function getGamesForUser(
  username: string,
): Promise<ChessComGame[]> {
  const archiveUrls = await getArchiveUrls(username);
  const currentArchiveUrl = archiveUrls[archiveUrls.length - 1];

  const monthlyGames = await Promise.all(
    archiveUrls.map(async (archiveUrl) => {
      const { year, month } = parseArchiveMonth(archiveUrl);
      const isCurrentMonth = archiveUrl === currentArchiveUrl;

      if (!isCurrentMonth) {
        const cached = await readCachedMonth(username, year, month);
        if (cached) return cached;
      }

      const games = await getGamesFromArchive(archiveUrl);
      await writeCachedMonth(username, year, month, games);
      return games;
    }),
  );

  return monthlyGames.flat().sort((a, b) => b.end_time - a.end_time);
}
