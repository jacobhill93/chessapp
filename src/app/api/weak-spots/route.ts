import { NextRequest, NextResponse } from "next/server";
import { CLASSIFICATION_SEVERITY_ORDER, MoveClassification } from "@/lib/analysis";
import { getWeakSpotSummary } from "@/lib/weakSpots";

export async function GET(request: NextRequest) {
  const username = request.nextUrl.searchParams.get("username");
  const minSeverityParam = request.nextUrl.searchParams.get("minSeverity");

  if (!username) {
    return NextResponse.json(
      { error: "Missing required 'username' query parameter" },
      { status: 400 },
    );
  }

  if (
    minSeverityParam &&
    !CLASSIFICATION_SEVERITY_ORDER.includes(minSeverityParam as MoveClassification)
  ) {
    return NextResponse.json(
      {
        error: `Invalid 'minSeverity'; expected one of ${CLASSIFICATION_SEVERITY_ORDER.join(", ")}`,
      },
      { status: 400 },
    );
  }

  try {
    const summary = await getWeakSpotSummary(username, {
      minSeverity: (minSeverityParam as MoveClassification) ?? undefined,
    });
    return NextResponse.json({ username, motifs: summary });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Failed to summarize weak spots" },
      { status: 500 },
    );
  }
}
