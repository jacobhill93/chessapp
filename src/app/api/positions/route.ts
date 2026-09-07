import { NextRequest, NextResponse } from "next/server";
import { ChessComError } from "@/lib/chesscom";
import { getGamesForUser } from "@/lib/gameStore";
import { getParsedGame } from "@/lib/positionStore";

export async function GET(request: NextRequest) {
  const username = request.nextUrl.searchParams.get("username");
  const uuid = request.nextUrl.searchParams.get("uuid");

  if (!username || !uuid) {
    return NextResponse.json(
      { error: "Missing required 'username' and 'uuid' query parameters" },
      { status: 400 },
    );
  }

  try {
    const games = await getGamesForUser(username);
    const game = games.find((g) => g.uuid === uuid);

    if (!game) {
      return NextResponse.json(
        { error: `No game with uuid ${uuid} found for ${username}` },
        { status: 404 },
      );
    }

    const parsed = await getParsedGame(username, game);
    return NextResponse.json(parsed);
  } catch (err) {
    if (err instanceof ChessComError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error(err);
    return NextResponse.json(
      { error: "Failed to parse game" },
      { status: 500 },
    );
  }
}
