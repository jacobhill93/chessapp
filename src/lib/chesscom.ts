const USER_AGENT = "ChessTrainingApp/0.1 (contact: jph093@gmail.com)";

export interface ChessComPlayer {
  rating: number;
  result: string;
  username: string;
  uuid: string;
}

export interface ChessComGame {
  url: string;
  pgn: string;
  time_control: string;
  end_time: number;
  rated: boolean;
  uuid: string;
  fen: string;
  time_class: string;
  rules: string;
  white: ChessComPlayer;
  black: ChessComPlayer;
  eco?: string;
}

class ChessComError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ChessComError";
  }
}

async function chessComFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
  });

  if (!res.ok) {
    throw new ChessComError(
      `chess.com API request to ${url} failed with ${res.status}`,
      res.status,
    );
  }

  return res.json() as Promise<T>;
}

/** Returns archive URLs, one per month the player has games, oldest first. */
export async function getArchiveUrls(username: string): Promise<string[]> {
  const data = await chessComFetch<{ archives: string[] }>(
    `https://api.chess.com/pub/player/${encodeURIComponent(username)}/games/archives`,
  );
  return data.archives;
}

export async function getGamesFromArchive(
  archiveUrl: string,
): Promise<ChessComGame[]> {
  const data = await chessComFetch<{ games: ChessComGame[] }>(archiveUrl);
  return data.games;
}

/** Parses the {yyyy}/{mm} suffix off a chess.com archive URL. */
export function parseArchiveMonth(archiveUrl: string): {
  year: string;
  month: string;
} {
  const match = archiveUrl.match(/\/(\d{4})\/(\d{2})$/);
  if (!match) {
    throw new Error(`Could not parse year/month from archive URL: ${archiveUrl}`);
  }
  return { year: match[1], month: match[2] };
}

export { ChessComError };
