import { NextRequest, NextResponse } from "next/server";
import { ChessComError } from "@/lib/chesscom";
import {
  attemptMove,
  IllegalMoveError,
  MistakeNotFoundError,
} from "@/lib/drill";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  if (
    !body ||
    typeof body.username !== "string" ||
    typeof body.uuid !== "string" ||
    typeof body.ply !== "number" ||
    typeof body.from !== "string" ||
    typeof body.to !== "string"
  ) {
    return NextResponse.json(
      {
        error:
          "Expected JSON body with 'username', 'uuid', 'ply', 'from', 'to', and optional 'promotion'/'depth'",
      },
      { status: 400 },
    );
  }

  try {
    const attempt = await attemptMove({
      username: body.username,
      uuid: body.uuid,
      ply: body.ply,
      from: body.from,
      to: body.to,
      promotion: typeof body.promotion === "string" ? body.promotion : undefined,
      depth: typeof body.depth === "number" ? body.depth : undefined,
    });
    return NextResponse.json(attempt);
  } catch (err) {
    if (err instanceof MistakeNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    if (err instanceof IllegalMoveError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof ChessComError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error(err);
    return NextResponse.json(
      { error: "Failed to process drill attempt" },
      { status: 500 },
    );
  }
}
