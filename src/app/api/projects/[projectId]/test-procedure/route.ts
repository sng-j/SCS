import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, apiError } from "@/lib/auth-helpers";

// GET — 조회 (없으면 자동 생성)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { projectId } = await params;
  const equipmentId = req.nextUrl.searchParams.get("equipmentId") || undefined;

  let tp = await prisma.testProcedure.findFirst({
    where: {
      projectId,
      equipmentId: equipmentId ?? null,
      deletedAt: null,
    },
    include: {
      hwGroups: { orderBy: { sortOrder: "asc" }, include: { hwItems: { orderBy: { sortOrder: "asc" } } } },
      hwItems: { orderBy: { sortOrder: "asc" } },
      fnItems: { orderBy: { sortOrder: "asc" } },
    },
  });

  // 없으면 자동 생성
  if (!tp) {
    tp = await prisma.testProcedure.create({
      data: { projectId, equipmentId: equipmentId ?? null, status: "MANUAL" },
      include: { hwGroups: { include: { hwItems: true } }, hwItems: true, fnItems: true },
    });
  }

  return NextResponse.json(tp);
}
