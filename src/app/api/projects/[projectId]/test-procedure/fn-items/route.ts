import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, apiError } from "@/lib/auth-helpers";

// PUT — fn items 일괄 저장 (delete + recreate)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { projectId } = await params;
  const body = await req.json();
  const { testProcId, items } = body as {
    testProcId: string;
    items: Array<{
      softwareId?: string;
      softwareName?: string;
      section: string;
      no: number;
      category?: string;
      criteria?: string;
      method?: string;
      sortOrder?: number;
    }>;
  };

  if (!testProcId) return NextResponse.json({ error: "testProcId required" }, { status: 400 });

  const tp = await prisma.testProcedure.findFirst({
    where: { id: testProcId, projectId, deletedAt: null },
  });
  if (!tp) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.testProcedureFnItem.deleteMany({ where: { testProcId } });
  const created = await prisma.testProcedureFnItem.createMany({
    data: items.map((item, i) => ({
      testProcId,
      softwareId: item.softwareId ?? null,
      softwareName: item.softwareName ?? null,
      section: item.section ?? "System Access",
      no: item.no ?? i + 1,
      category: item.category ?? null,
      criteria: item.criteria ?? null,
      method: item.method ?? null,
      sortOrder: item.sortOrder ?? i,
    })),
  });

  return NextResponse.json({ count: created.count });
}
