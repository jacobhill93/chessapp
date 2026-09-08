#!/usr/bin/env node
// Downloads and indexes the Lichess public puzzle database
// (https://database.lichess.org, CC0) into a local SQLite file so the app
// can query puzzles by theme without loading the ~6M-row CSV into memory.
// See CLAUDE.md's Stage 9 notes for why: flat JSON (this project's usual
// cache format) doesn't hold up at this size, and the CSV itself is a
// ~300MB .zst download, too large to fetch on every request.
//
// Usage: npm run ingest:puzzles [-- --force] [-- --limit N]
//   --force     re-download the source CSV even if already cached locally.
//   --limit N   stop after N puzzles (for a quick smoke test of the pipeline).
//
// Uses fzstd (pure JS, no native/WASM build step) to decompress and
// node:sqlite (built into Node 22+, no extra native dependency) to index —
// both deliberately chosen to avoid the native-module Windows portability
// problems this project has already hit once with node-gyp-style deps.

import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { open as openFile } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Decompress } from "fzstd";

const PUZZLE_CSV_URL = "https://database.lichess.org/lichess_db_puzzle.csv.zst";
const DATA_DIR = path.join(process.cwd(), "data");
const ZST_PATH = path.join(DATA_DIR, "lichess", "lichess_db_puzzle.csv.zst");
const DB_PATH = path.join(DATA_DIR, "puzzles", "puzzles.db");

const COLUMNS = [
  "PuzzleId",
  "FEN",
  "Moves",
  "Rating",
  "RatingDeviation",
  "Popularity",
  "NbPlays",
  "Themes",
  "GameUrl",
  "OpeningTags",
  "DailyDate",
];

async function downloadIfMissing(force) {
  mkdirSync(path.dirname(ZST_PATH), { recursive: true });
  if (existsSync(ZST_PATH) && !force) {
    console.log(`Using cached download at ${ZST_PATH} (pass --force to re-download).`);
    return;
  }

  console.log(`Downloading ${PUZZLE_CSV_URL} ...`);
  const res = await fetch(PUZZLE_CSV_URL);
  if (!res.ok || !res.body) {
    throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  }

  const totalBytes = Number(res.headers.get("content-length") ?? 0);
  let receivedBytes = 0;
  let lastLoggedPercent = -1;

  const out = createWriteStream(ZST_PATH);
  for await (const chunk of res.body) {
    receivedBytes += chunk.length;
    if (totalBytes) {
      const percent = Math.floor((receivedBytes / totalBytes) * 100);
      if (percent !== lastLoggedPercent && percent % 5 === 0) {
        lastLoggedPercent = percent;
        console.log(`  ${percent}% (${(receivedBytes / 1e6).toFixed(0)}MB / ${(totalBytes / 1e6).toFixed(0)}MB)`);
      }
    }
    if (!out.write(chunk)) {
      await new Promise((resolve) => out.once("drain", resolve));
    }
  }
  await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())));
  console.log("Download complete.");
}

function openDatabase() {
  mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = OFF");
  db.exec("PRAGMA synchronous = OFF");
  db.exec("DROP TABLE IF EXISTS puzzles");
  db.exec("DROP TABLE IF EXISTS puzzle_themes");
  db.exec(`
    CREATE TABLE puzzles (
      id TEXT PRIMARY KEY,
      fen TEXT NOT NULL,
      moves TEXT NOT NULL,
      rating INTEGER NOT NULL,
      rating_deviation INTEGER NOT NULL,
      popularity INTEGER NOT NULL,
      nb_plays INTEGER NOT NULL,
      themes TEXT NOT NULL,
      game_url TEXT,
      opening_tags TEXT
    )
  `);
  // No constraints/indexes on puzzle_themes until after the bulk load —
  // building them incrementally on a ~30M-row table (a puzzle averages
  // several themes) is far slower than a single CREATE INDEX pass at the end.
  db.exec(`
    CREATE TABLE puzzle_themes (
      puzzle_id TEXT NOT NULL,
      theme TEXT NOT NULL
    )
  `);
  return db;
}

/** Turns decompressed byte chunks into complete CSV lines, buffering any partial line across chunk boundaries. */
function makeLineSplitter(onLine) {
  const decoder = new TextDecoder("utf-8");
  let carry = "";
  return {
    push(chunk, isLast) {
      carry += decoder.decode(chunk, { stream: !isLast });
      const lines = carry.split("\n");
      carry = lines.pop() ?? "";
      for (const line of lines) onLine(line);
      if (isLast && carry) onLine(carry);
    },
  };
}

function parseRow(line) {
  const fields = line.split(",");
  if (fields.length < COLUMNS.length - 1) return null; // DailyDate may be entirely absent on old dumps
  const [id, fen, moves, rating, ratingDeviation, popularity, nbPlays, themes, gameUrl, openingTags] = fields;
  return {
    id,
    fen,
    moves,
    rating: Number(rating),
    ratingDeviation: Number(ratingDeviation),
    popularity: Number(popularity),
    nbPlays: Number(nbPlays),
    themes: themes ?? "",
    gameUrl: gameUrl ?? "",
    openingTags: openingTags ?? "",
  };
}

async function ingest(limit) {
  const db = openDatabase();
  const insertPuzzle = db.prepare(
    `INSERT INTO puzzles (id, fen, moves, rating, rating_deviation, popularity, nb_plays, themes, game_url, opening_tags)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertTheme = db.prepare(`INSERT INTO puzzle_themes (puzzle_id, theme) VALUES (?, ?)`);

  let rowCount = 0;
  let inTransaction = false;
  const BATCH_SIZE = 5000;
  const STOP = Symbol("stop");

  function processRow(row) {
    if (!row || !row.id || row.id === "PuzzleId") return; // skip header/garbage
    if (limit && rowCount >= limit) throw STOP;

    if (!inTransaction) {
      db.exec("BEGIN");
      inTransaction = true;
    }

    insertPuzzle.run(
      row.id,
      row.fen,
      row.moves,
      row.rating,
      row.ratingDeviation,
      row.popularity,
      row.nbPlays,
      row.themes,
      row.gameUrl,
      row.openingTags,
    );
    for (const theme of row.themes.split(" ").filter(Boolean)) {
      insertTheme.run(row.id, theme);
    }

    rowCount++;
    if (rowCount % BATCH_SIZE === 0) {
      db.exec("COMMIT");
      inTransaction = false;
      if (rowCount % 500_000 === 0) console.log(`  ingested ${rowCount.toLocaleString()} puzzles...`);
    }
  }

  const splitter = makeLineSplitter((line) => {
    if (!line) return;
    processRow(parseRow(line));
  });

  const decompressor = new Decompress((chunk, isLast) => splitter.push(chunk, isLast));

  const file = await openFile(ZST_PATH, "r");
  try {
    const CHUNK_SIZE = 1 << 20; // 1MB
    let position = 0;
    stopped: for (;;) {
      // A fresh buffer per read: fzstd's decompressor may retain a reference
      // to the chunk we push (e.g. across an incomplete block boundary), so
      // reusing one buffer across reads risks corrupting already-pushed data.
      const buf = Buffer.alloc(CHUNK_SIZE);
      const { bytesRead } = await file.read(buf, 0, CHUNK_SIZE, position);
      if (bytesRead === 0) {
        decompressor.push(new Uint8Array(0), true);
        break;
      }
      position += bytesRead;
      try {
        decompressor.push(new Uint8Array(buf.buffer, buf.byteOffset, bytesRead), false);
      } catch (err) {
        if (err === STOP) break stopped;
        throw err;
      }
    }
  } finally {
    await file.close();
  }

  if (inTransaction) db.exec("COMMIT");
  console.log(`Ingested ${rowCount.toLocaleString()} puzzles total. Building indexes...`);

  db.exec("CREATE INDEX idx_puzzle_themes_theme ON puzzle_themes(theme)");
  db.exec("CREATE INDEX idx_puzzle_themes_puzzle_id ON puzzle_themes(puzzle_id)");
  db.exec("CREATE INDEX idx_puzzles_rating ON puzzles(rating)");

  db.close();
  console.log(`Done. Database at ${DB_PATH}.`);
}

async function main() {
  const force = process.argv.includes("--force");
  const limitIndex = process.argv.indexOf("--limit");
  const limit = limitIndex !== -1 ? Number(process.argv[limitIndex + 1]) : undefined;
  await downloadIfMissing(force);
  await ingest(limit);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
