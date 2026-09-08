import { NextRequest, NextResponse } from "next/server";
import {
  attemptPuzzleMove,
  IllegalPuzzleMoveError,
  PuzzleAlreadyCompleteError,
  PuzzleNotFoundError,
} from "@/lib/puzzleDrill";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  if (
    !body ||
    typeof body.username !== "string" ||
    typeof body.motif !== "string" ||
    typeof body.puzzleId !== "string" ||
    typeof body.moveIndex !== "number" ||
    typeof body.from !== "string" ||
    typeof body.to !== "string"
  ) {
    return NextResponse.json(
      {
        error:
          "Expected JSON body with 'username', 'motif', 'puzzleId', 'moveIndex', 'from', 'to', and optional 'promotion'",
      },
      { status: 400 },
    );
  }

  try {
    const result = await attemptPuzzleMove({
      username: body.username,
      motif: body.motif,
      puzzleId: body.puzzleId,
      moveIndex: body.moveIndex,
      from: body.from,
      to: body.to,
      promotion: typeof body.promotion === "string" ? body.promotion : undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof PuzzleNotFoundError || err instanceof PuzzleAlreadyCompleteError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    if (err instanceof IllegalPuzzleMoveError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json(
      { error: "Failed to process puzzle attempt" },
      { status: 500 },
    );
  }
}
