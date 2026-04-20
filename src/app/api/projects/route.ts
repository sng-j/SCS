import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, apiError } from "@/lib/auth-helpers";
import { safeError } from "@/lib/safe-log";

export const dynamic = "force-dynamic";

/** GET /api/projects — list projects for the current user */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  // Build project filter based on role
  let where: Record<string, unknown> = {};
  if (user.role === "SHIPYARD" || user.role === "SUPPORT") {
    // SHIPYARD (viewer) and SUPPORT are scoped to their shipyardId
    if (user.shipyardId) {
      where = { shipyardId: user.shipyardId };
    } else {
      where = { id: "__none__" }; // no results
    }
  } else if (user.role === "VENDOR") {
    // Only show projects where the vendor has active (non-deleted) equipment
    where = { equipments: { some: { deletedAt: null, vendors: { some: { id: user.id } } } } };
  }
  // ADMIN: empty filter = all projects

  const projects = await prisma.project.findMany({
    where,
    include: {
      _count: {
        select: {
          hardware: { where: { deletedAt: null } },
          software: { where: { deletedAt: null } },
          equipments: { where: { deletedAt: null } },
        },
      },
      projectGroup: { select: { id: true, name: true, shipowner: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(projects);
}

/** POST /api/projects — create a new project (SUPPORT/ADMIN only) */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  // Write: only SUPPORT or ADMIN can create projects. SHIPYARD is read-only.
  if (user.role !== "SUPPORT" && user.role !== "ADMIN") {
    return apiError("Only support and admin can create projects", 403);
  }

  // SUPPORT must have shipyardId assigned
  if (user.role === "SUPPORT" && !user.shipyardId) {
    return apiError("Shipyard assignment required", 400);
  }

  try {
    const body = await request.json();
    const { vesselName, classification, systemName, shipowner, projectGroupId } = body;

    if (!vesselName || typeof vesselName !== "string") {
      return apiError("Vessel name is required", 400);
    }

    const project = await prisma.project.create({
      data: {
        vesselName: vesselName.trim(),
        classification: classification || null,
        systemName: systemName?.trim() || null,
        shipowner: shipowner?.trim() || null,
        ...(user.shipyardId ? { shipyardId: user.shipyardId } : {}),
        ...(projectGroupId ? { projectGroupId } : {}),
      },
    });

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    safeError("Project POST error", error);
    return apiError("Failed to create project", 500);
  }
}
