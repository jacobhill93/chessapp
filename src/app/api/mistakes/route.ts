import { NextRequest, NextResponse } from "next/server";
import { CLASSIFICATION_SEVERITY_ORDER, MoveClassification } from "@/lib/analysis";
import { getMistakesForUser } from "@/lib/mistakes";

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
    const mistakes = await getMistakesForUser(username, {
      minSeverity: (minSeverityParam as MoveClassification) ?? undefined,
    });
    return NextResponse.json({ username, count: mistakes.length, mistakes });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Failed to list mistakes" },
      { status: 500 },
    );
  }
}
