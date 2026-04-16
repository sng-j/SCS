import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, apiError } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

/** GET /api/society-checklist — list all society checklist items */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { searchParams } = new URL(request.url);
  const classification = searchParams.get("classification"); // optional filter

  const where = classification ? { classification: classification as "KR" | "LR" | "DNV" | "ABS" | "BV" | "CCS" } : {};

  const checks = await prisma.societyChecklist.findMany({
    where,
    orderBy: [{ classification: "asc" }, { category: "asc" }, { checkId: "asc" }],
  });

  return NextResponse.json(checks);
}
