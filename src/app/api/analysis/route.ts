import { NextRequest, NextResponse } from "next/server";
import { getGameAnalysis } from "@/lib/analysisStore";
import { ChessComError } from "@/lib/chesscom";
import { getGamesForUser } from "@/lib/gameStore";
import { getParsedGame } from "@/lib/positionStore";

export async function GET(request: NextRequest) {
  const username = request.nextUrl.searchParams.get("username");
  const uuid = request.nextUrl.searchParams.get("uuid");
  const depthParam = request.nextUrl.searchParams.get("depth");

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
    const analysis = await getGameAnalysis(
      username,
      parsed,
      depthParam ? { depth: Number(depthParam) } : undefined,
    );
    return NextResponse.json(analysis);
  } catch (err) {
    if (err instanceof ChessComError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error(err);
    return NextResponse.json(
      { error: "Failed to analyze game" },
      { status: 500 },
    );
  }
}
