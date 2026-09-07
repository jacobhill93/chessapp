import { NextRequest, NextResponse } from "next/server";
import { getDrillHistory } from "@/lib/drill";

export async function GET(request: NextRequest) {
  const username = request.nextUrl.searchParams.get("username");
  const uuid = request.nextUrl.searchParams.get("uuid");
  const plyParam = request.nextUrl.searchParams.get("ply");

  if (!username || !uuid || !plyParam) {
    return NextResponse.json(
      { error: "Missing required 'username', 'uuid', and 'ply' query parameters" },
      { status: 400 },
    );
  }

  try {
    const history = await getDrillHistory(username, uuid, Number(plyParam));
    return NextResponse.json(history);
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Failed to load drill history" },
      { status: 500 },
    );
  }
}
