import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, apiError } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

/** Total expected documents per project (UR E26/E27 standard set) */
const TOTAL_DOCUMENTS = 13;

/** GET /api/fleet — return fleet compliance data for accessible projects */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  // Build project filter based on role
  let whereClause: Record<string, unknown> = {};
  if (user.role === "SHIPYARD" || user.role === "SUPPORT") {
    // SHIPYARD (viewer) and SUPPORT both scope by shipyardId
    whereClause = user.shipyardId ? { shipyardId: user.shipyardId } : { id: "__none__" };
  } else if (user.role === "VENDOR") {
    whereClause = { equipments: { some: { deletedAt: null, vendors: { some: { id: user.id } } } } };
  }
  // ADMIN: empty filter = all projects

  const projects = await prisma.project.findMany({
    where: whereClause,
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      vesselName: true,
      classification: true,
      status: true,
      complianceScore: true,
      createdAt: true,
      updatedAt: true,
      projectGroup: { select: { id: true, name: true, shipowner: true } },
      _count: {
        select: {
          hardware: { where: { deletedAt: null } },
          software: { where: { deletedAt: null } },
          equipments: { where: { deletedAt: null } },
        },
      },
      equipments: {
        where: { deletedAt: null },
        select: { id: true, status: true },
      },
      hardware: {
        where: { deletedAt: null },
        select: {
          assessments: {
            where: { deletedAt: null },
            select: { result: true },
          },
        },
      },
      submissions: {
        where: { deletedAt: null },
        select: {
          documents: {
            where: { deletedAt: null },
            select: { id: true },
          },
        },
      },
    },
  });

  const fleetData = projects.map((project) => {
    // Calculate assessment stats across all hardware
    let assessTotal = 0;
    let assessCompleted = 0;
    for (const hw of project.hardware) {
      for (const a of hw.assessments) {
        assessTotal++;
        if (a.result !== "NOT_CHECKED") {
          assessCompleted++;
        }
      }
    }
    const assessmentCompletion =
      assessTotal > 0 ? Math.round((assessCompleted / assessTotal) * 100) : 0;

    // Calculate document count across all submissions
    let documentCount = 0;
    for (const sub of project.submissions) {
      documentCount += sub.documents.length;
    }

    const eqTotal = project.equipments.length;
    const eqApproved = project.equipments.filter((e) => e.status === "APPROVED").length;

    return {
      id: project.id,
      vesselName: project.vesselName,
      classification: project.classification,
      status: project.status,
      complianceScore: project.complianceScore ?? 0,
      hardwareCount: project._count.hardware,
      softwareCount: project._count.software,
      equipmentCount: eqTotal,
      equipmentApproved: eqApproved,
      assessmentCompletion,
      assessTotal,
      assessCompleted,
      documentCount: Math.min(documentCount, TOTAL_DOCUMENTS),
      totalDocuments: TOTAL_DOCUMENTS,
      updatedAt: project.updatedAt,
      projectGroup: (project as unknown as { projectGroup?: { id: string; name: string; shipowner: string | null } }).projectGroup || null,
    };
  });

  // Summary stats
  const totalVessels = fleetData.length;
  const avgCompliance =
    totalVessels > 0
      ? Math.round(
          fleetData.reduce((sum, p) => sum + p.complianceScore, 0) / totalVessels,
        )
      : 0;
  const needsAttention = fleetData.filter(
    (p) => p.complianceScore < 50 || p.status === "ACTIVE",
  ).length;

  return NextResponse.json({
    summary: {
      totalVessels,
      avgCompliance,
      needsAttention,
    },
    projects: fleetData,
  });
}
