import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, apiError } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

/** GET /api/society-checklist — list all society checklist items */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { searchParams } = new URL(request.url);
  const classification = searchParams.get("classification");

  const where = classification ? { classification } : {};

  const checks = await prisma.societyChecklist.findMany({
    where,
    orderBy: [{ classification: "asc" }, { category: "asc" }, { checkId: "asc" }],
  });

  return NextResponse.json(checks);
}

/** POST /api/society-checklist — create new checklist item (ADMIN only) */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return apiError("Forbidden", 403);

  const body = await request.json();
  const { classification, checkId, category, question, questionKo, guidance, isRequired } = body;

  if (!classification || !checkId || !category || !question) {
    return apiError("classification, checkId, category, question are required", 400);
  }

  const item = await prisma.societyChecklist.create({
    data: {
      classification, checkId, category, question,
      questionKo: questionKo || null,
      guidance: guidance || null,
      isRequired: isRequired ?? true,
    },
  });
  return NextResponse.json(item, { status: 201 });
}

/** PATCH /api/society-checklist — update (ADMIN only) */
export async function PATCH(request: NextRequest) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return apiError("Forbidden", 403);

  const body = await request.json();
  const { id, ...updates } = body;
  if (!id) return apiError("id is required", 400);

  const item = await prisma.societyChecklist.update({
    where: { id: Number(id) },
    data: updates,
  });
  return NextResponse.json(item);
}

/** DELETE /api/society-checklist?id=XXX (ADMIN only) */
export async function DELETE(request: NextRequest) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return apiError("Forbidden", 403);

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return apiError("id is required", 400);

  await prisma.societyChecklist.delete({ where: { id: Number(id) } });
  return NextResponse.json({ ok: true });
}
