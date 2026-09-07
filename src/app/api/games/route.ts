import { NextRequest, NextResponse } from "next/server";
import { ChessComError } from "@/lib/chesscom";
import { getGamesForUser } from "@/lib/gameStore";

export async function GET(request: NextRequest) {
  const username = request.nextUrl.searchParams.get("username");

  if (!username) {
    return NextResponse.json(
      { error: "Missing required 'username' query parameter" },
      { status: 400 },
    );
  }

  try {
    const games = await getGamesForUser(username);
    return NextResponse.json({ username, count: games.length, games });
  } catch (err) {
    if (err instanceof ChessComError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error(err);
    return NextResponse.json(
      { error: "Failed to fetch games" },
      { status: 500 },
    );
  }
}
