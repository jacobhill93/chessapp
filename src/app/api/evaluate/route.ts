import { NextRequest, NextResponse } from "next/server";
import { evaluatePosition } from "@/lib/stockfish";

export async function GET(request: NextRequest) {
  const fen = request.nextUrl.searchParams.get("fen");
  const depthParam = request.nextUrl.searchParams.get("depth");

  if (!fen) {
    return NextResponse.json(
      { error: "Missing required 'fen' query parameter" },
      { status: 400 },
    );
  }

  try {
    const evaluation = await evaluatePosition(
      fen,
      depthParam ? { depth: Number(depthParam) } : undefined,
    );
    return NextResponse.json(evaluation);
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Failed to evaluate position" },
      { status: 500 },
    );
  }
}
