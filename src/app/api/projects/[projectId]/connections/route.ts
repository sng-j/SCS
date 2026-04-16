import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET — 프로젝트의 모든 연결 조회
export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = await params;

  const connections = await prisma.networkConnection.findMany({
    where: { projectId, deletedAt: null },
    select: { id: true, fromHwId: true, toHwId: true, medium: true, protocol: true, encrypted: true },
    orderBy: { createdAt: "asc" },
  });

  // Map to frontend format
  const result = connections.map((c) => ({
    id: c.id,
    fromId: c.fromHwId,
    toId: c.toHwId,
    medium: c.medium,
    protocol: c.protocol || "",
    encrypted: c.encrypted,
  }));

  return NextResponse.json(result);
}

// PUT — 프로젝트의 연결 전체 교체 (수동 입력 반영)
export async function PUT(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = await params;
  const body = await req.json() as { connections: { fromId: string; toId: string; medium: string; protocol: string; encrypted: boolean }[] };

  // Delete all existing connections for this project
  await prisma.networkConnection.deleteMany({ where: { projectId } });

  // Create new connections
  if (body.connections.length > 0) {
    await prisma.networkConnection.createMany({
      data: body.connections.map((c) => ({
        projectId,
        fromHwId: c.fromId,
        toHwId: c.toId,
        medium: c.medium || "ethernet",
        protocol: c.protocol || null,
        encrypted: c.encrypted || false,
      })),
    });
  }

  return NextResponse.json({ ok: true, count: body.connections.length });
}
