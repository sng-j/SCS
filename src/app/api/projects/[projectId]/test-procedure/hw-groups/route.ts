import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, apiError } from "@/lib/auth-helpers";

// POST — HW 그룹 생성
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { projectId } = await params;
  const body = await req.json();
  const { testProcId, label, hardwareIds } = body as {
    testProcId: string;
    label: string;
    hardwareIds: string[];
  };

  if (!testProcId || !label || !hardwareIds?.length) {
    return NextResponse.json({ error: "testProcId, label, hardwareIds required" }, { status: 400 });
  }

  const tp = await prisma.testProcedure.findFirst({
    where: { id: testProcId, projectId, deletedAt: null },
  });
  if (!tp) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const count = await prisma.testProcHwGroup.count({ where: { testProcId } });

  const group = await prisma.testProcHwGroup.create({
    data: {
      testProcId,
      label,
      hardwareIds: JSON.stringify(hardwareIds),
      sortOrder: count,
    },
    include: { hwItems: true },
  });

  return NextResponse.json(group, { status: 201 });
}

// DELETE — HW 그룹 삭제 (하위 항목도 cascade)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { projectId } = await params;
  const groupId = req.nextUrl.searchParams.get("groupId");

  if (!groupId) return NextResponse.json({ error: "groupId required" }, { status: 400 });

  const group = await prisma.testProcHwGroup.findFirst({
    where: { id: groupId },
    include: { testProcedure: true },
  });

  if (!group || group.testProcedure.projectId !== projectId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.testProcHwGroup.delete({ where: { id: groupId } });

  return NextResponse.json({ success: true });
}
