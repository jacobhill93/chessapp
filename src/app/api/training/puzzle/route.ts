import { NextRequest, NextResponse } from "next/server";
import { pickPuzzleForUser } from "@/lib/puzzleDrill";
import { isPuzzleDatabaseAvailable } from "@/lib/puzzles";

/**
 * GET /api/training/puzzle?username=&motif=[&minRating=&maxRating=]
 *
 * Serves a puzzle for the given motif that this user hasn't already
 * attempted, per their saved history — never the solution, since grading
 * happens server-side via POST /api/training/attempt.
 */
export async function GET(request: NextRequest) {
  const username = request.nextUrl.searchParams.get("username");
  const motif = request.nextUrl.searchParams.get("motif");
  const minRatingParam = request.nextUrl.searchParams.get("minRating");
  const maxRatingParam = request.nextUrl.searchParams.get("maxRating");

  if (!username || !motif) {
    return NextResponse.json(
      { error: "Missing required 'username' and 'motif' query parameters" },
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
    const puzzle = await pickPuzzleForUser(username, motif, {
      minRating: minRatingParam ? Number(minRatingParam) : undefined,
      maxRating: maxRatingParam ? Number(maxRatingParam) : undefined,
    });

    if (!puzzle) {
      return NextResponse.json(
        { error: `No unattempted puzzle found for motif '${motif}' in the given rating range` },
        { status: 404 },
      );
    }

    return NextResponse.json(puzzle);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch puzzle" }, { status: 500 });
  }
}
