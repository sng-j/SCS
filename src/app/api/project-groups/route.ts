import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, apiError } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

/** GET /api/project-groups — list project groups for current shipyard */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const where = user.role === "ADMIN" ? {} : { shipyardId: user.shipyardId || "__none__" };

  const groups = await prisma.projectGroup.findMany({
    where,
    include: {
      _count: { select: { projects: true } },
      projects: {
        select: { id: true, vesselName: true, status: true, classification: true },
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(groups);
}

/** POST /api/project-groups — create a new project group */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);
  if (user.role !== "SHIPYARD" && user.role !== "ADMIN") return apiError("Forbidden", 403);

  try {
    const body = await request.json();
    const { name, shipowner, description } = body;
    if (!name?.trim()) return apiError("Name is required", 400);

    const group = await prisma.projectGroup.create({
      data: {
        name: name.trim(),
        shipowner: shipowner?.trim() || null,
        description: description?.trim() || null,
        shipyardId: user.shipyardId || null,
      },
    });

    return NextResponse.json(group, { status: 201 });
  } catch {
    return apiError("Failed to create project group", 500);
  }
}
