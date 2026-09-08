import path from "node:path";
import { DatabaseSync } from "node:sqlite";

/**
 * Read-only access to the Lichess puzzle index built by
 * scripts/ingestPuzzles.mjs (see CLAUDE.md Stage 9, Phase 3) — 6.1M puzzles
 * in data/puzzles/puzzles.db, queryable by theme without loading the
 * ~300MB source CSV. Uses node:sqlite (built into Node 22+, no native
 * dependency to break on someone else's machine — see the ingestion
 * script's own comment for why that mattered here).
 */
export interface Puzzle {
  id: string;
  fen: string;
  /** UCI moves, in order. moves[0] is the "setup" move Lichess expects the
   * viewer to make first to reach the position being trained; the puzzle's
   * actual solution starts at moves[1]. */
  moves: string[];
  rating: number;
  popularity: number;
  nbPlays: number;
  themes: string[];
  gameUrl: string;
}

const DB_PATH = path.join(process.cwd(), "data", "puzzles", "puzzles.db");

let db: InstanceType<typeof DatabaseSync> | undefined;

function getDb() {
  if (!db) {
    db = new DatabaseSync(DB_PATH, { readOnly: true });
  }
  return db;
}

function isDbMissingError(err: unknown): boolean {
  return err instanceof Error && /unable to open database file/i.test(err.message);
}

interface PuzzleRow {
  id: string;
  fen: string;
  moves: string;
  rating: number;
  popularity: number;
  nb_plays: number;
  themes: string;
  game_url: string;
}

function rowToPuzzle(row: PuzzleRow): Puzzle {
  return {
    id: row.id,
    fen: row.fen,
    moves: row.moves.split(" "),
    rating: row.rating,
    popularity: row.popularity,
    nbPlays: row.nb_plays,
    themes: row.themes.split(" ").filter(Boolean),
    gameUrl: row.game_url,
  };
}

function getDbOrUndefined(): ReturnType<typeof getDb> | undefined {
  try {
    return getDb();
  } catch (err) {
    if (isDbMissingError(err)) return undefined;
    throw err;
  }
}

export interface FindPuzzleOptions {
  /** Defaults to 400 below/above a rating of 1500 if omitted entirely. */
  minRating?: number;
  maxRating?: number;
  /** Puzzle ids to skip — e.g. ones already drilled recently. */
  excludeIds?: string[];
}

/**
 * Picks one random puzzle tagged with `theme` (a Lichess theme string —
 * see https://lichess.org/training/themes for the full vocabulary; our own
 * tactic motifs in src/lib/motif.ts use identical spellings for fork, pin,
 * skewer, discoveredCheck, doubleCheck, and backRankMate specifically so
 * a Motif value can be passed here directly).
 *
 * Orders by `RANDOM()` after filtering, which is only efficient because the
 * theme + rating-range filter narrows the join down to a few
 * thousand/tens-of-thousands of rows first (every one of our six tactic
 * motifs has 30k-780k matching puzzles in the full database) — this would
 * not scale to an unfiltered `RANDOM()` sort over all 6.1M puzzles.
 *
 * Returns undefined if the puzzle database hasn't been ingested yet
 * (see `npm run ingest:puzzles`) or no puzzle matches.
 */
export function findRandomPuzzleByTheme(
  theme: string,
  options: FindPuzzleOptions = {},
): Puzzle | undefined {
  const minRating = options.minRating ?? 1100;
  const maxRating = options.maxRating ?? 1900;
  const excludeIds = options.excludeIds ?? [];

  const database = getDbOrUndefined();
  if (!database) return undefined;

  const exclusionClause = excludeIds.length
    ? `AND p.id NOT IN (${excludeIds.map(() => "?").join(",")})`
    : "";

  const row = database
    .prepare(
      `SELECT p.id, p.fen, p.moves, p.rating, p.popularity, p.nb_plays, p.themes, p.game_url
       FROM puzzles p
       JOIN puzzle_themes t ON p.id = t.puzzle_id
       WHERE t.theme = ? AND p.rating BETWEEN ? AND ? ${exclusionClause}
       ORDER BY RANDOM()
       LIMIT 1`,
    )
    .get(theme, minRating, maxRating, ...excludeIds) as PuzzleRow | undefined;

  return row ? rowToPuzzle(row) : undefined;
}

/**
 * Looks up one puzzle by id — used to re-fetch a puzzle authoritatively
 * when grading an attempt, rather than trusting a client-supplied FEN or
 * solution (see src/lib/puzzleDrill.ts).
 */
export function getPuzzleById(id: string): Puzzle | undefined {
  const database = getDbOrUndefined();
  if (!database) return undefined;

  const row = database
    .prepare(
      `SELECT id, fen, moves, rating, popularity, nb_plays, themes, game_url
       FROM puzzles WHERE id = ?`,
    )
    .get(id) as PuzzleRow | undefined;

  return row ? rowToPuzzle(row) : undefined;
}

export function isPuzzleDatabaseAvailable(): boolean {
  return getDbOrUndefined() !== undefined;
}
