import { NextRequest, NextResponse } from "next/server";
import { getPuzzleTrainingSummary } from "@/lib/puzzleDrill";

export async function GET(request: NextRequest) {
  const username = request.nextUrl.searchParams.get("username");
  const motif = request.nextUrl.searchParams.get("motif");

  if (!username || !motif) {
    return NextResponse.json(
      { error: "Missing required 'username' and 'motif' query parameters" },
      { status: 400 },
    );
  }

  try {
    const summary = await getPuzzleTrainingSummary(username, motif);
    return NextResponse.json({ username, motif, ...summary });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Failed to load puzzle training history" },
      { status: 500 },
    );
  }
}
