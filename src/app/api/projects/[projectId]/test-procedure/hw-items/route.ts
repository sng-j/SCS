import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, apiError } from "@/lib/auth-helpers";

// PUT — 특정 그룹의 hw items 일괄 저장 (delete + recreate)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { projectId } = await params;
  const body = await req.json();
  const { testProcId, hwGroupId, items } = body as {
    testProcId: string;
    hwGroupId: string;
    items: Array<{
      no: number;
      category?: string;
      criteria?: string;
      method?: string;
      sortOrder?: number;
    }>;
  };

  if (!testProcId || !hwGroupId) {
    return NextResponse.json({ error: "testProcId, hwGroupId required" }, { status: 400 });
  }

  const tp = await prisma.testProcedure.findFirst({
    where: { id: testProcId, projectId, deletedAt: null },
  });
  if (!tp) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // __general__ means no group (common items)
  const isGeneral = hwGroupId === "__general__";

  // Replace items for this group only
  await prisma.testProcedureHwItem.deleteMany({
    where: { testProcId, hwGroupId: isGeneral ? null : hwGroupId },
  });
  const created = await prisma.testProcedureHwItem.createMany({
    data: items.map((item, i) => ({
      testProcId,
      hwGroupId: isGeneral ? null : hwGroupId,
      no: item.no ?? i + 1,
      category: item.category ?? null,
      criteria: item.criteria ?? null,
      method: item.method ?? null,
      sortOrder: item.sortOrder ?? i,
    })),
  });

  return NextResponse.json({ count: created.count });
}
