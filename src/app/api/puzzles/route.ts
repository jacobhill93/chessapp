import { NextRequest, NextResponse } from "next/server";
import { findRandomPuzzleByTheme, isPuzzleDatabaseAvailable } from "@/lib/puzzles";

/**
 * GET /api/puzzles?theme=fork[&minRating=1100&maxRating=1900]
 *
 * Serves a random Lichess puzzle for a given theme, from the local index
 * built by `npm run ingest:puzzles` (see CLAUDE.md Stage 9, Phase 3). Not
 * yet wired into a training UI (Phase 4) — this exists so the ingested
 * database is queryable/testable end to end ahead of that.
 */
export async function GET(request: NextRequest) {
  const theme = request.nextUrl.searchParams.get("theme");
  const minRatingParam = request.nextUrl.searchParams.get("minRating");
  const maxRatingParam = request.nextUrl.searchParams.get("maxRating");

  if (!theme) {
    return NextResponse.json(
      { error: "Missing required 'theme' query parameter" },
      { status: 400 },
    );
  }

  if (!isPuzzleDatabaseAvailable()) {
    return NextResponse.json(
      { error: "Puzzle database not found — run 'npm run ingest:puzzles' first." },
      { status: 503 },
    );
  }

  try {
    const puzzle = findRandomPuzzleByTheme(theme, {
      minRating: minRatingParam ? Number(minRatingParam) : undefined,
      maxRating: maxRatingParam ? Number(maxRatingParam) : undefined,
    });

    if (!puzzle) {
      return NextResponse.json(
        { error: `No puzzle found for theme '${theme}' in the given rating range` },
        { status: 404 },
      );
    }

    return NextResponse.json(puzzle);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch puzzle" }, { status: 500 });
  }
}
