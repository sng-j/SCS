import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, apiError } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

/** GET /api/dashboard — aggregated stats for current user */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  // Build project filter based on role
  let projectFilter: Record<string, unknown> = {};
  if (user.role === "SHIPYARD") {
    projectFilter = user.shipyardId ? { shipyardId: user.shipyardId } : { id: "__none__" };
  } else if (user.role === "VENDOR") {
    projectFilter = { equipments: { some: { deletedAt: null, vendors: { some: { id: user.id } } } } };
  }
  // ADMIN: empty filter = all projects

  const [
    projects,
    pendingSubmissions,
    recentChanges,
  ] = await Promise.all([
    // All accessible projects with counts
    prisma.project.findMany({
      where: projectFilter,
      include: {
        _count: {
          select: {
            hardware: { where: { deletedAt: null } },
            software: { where: { deletedAt: null } },
            submissions: { where: { deletedAt: null } },
            equipments: { where: { deletedAt: null } },
          },
        },
        projectGroup: { select: { id: true, name: true, shipowner: true } },
        submissions: {
          where: { status: "SUBMITTED" },
          select: { id: true },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 10,
    }),

    // Pending review submissions
    prisma.submission.count({
      where: {
        status: { in: ["SUBMITTED", "UNDER_REVIEW"] },
        project: projectFilter,
      },
    }),

    // Recent changes (last 7 days)
    prisma.changeEvent.count({
      where: {
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        project: projectFilter,
      },
    }),
  ]);

  // Calculate average compliance score
  const projectsWithScore = projects.filter((p) => p.complianceScore !== null);
  const avgScore =
    projectsWithScore.length > 0
      ? Math.round(
          projectsWithScore.reduce((sum, p) => sum + (p.complianceScore ?? 0), 0) /
            projectsWithScore.length
        )
      : null;

  // Vendors don't review submissions — show pending equipment count instead
  let pendingReviews = pendingSubmissions;
  let vendorEquipment: unknown[] = [];

  // Build equipment filter by role
  let eqWhere: Record<string, unknown> = {};
  if (user.role === "VENDOR") {
    eqWhere = { deletedAt: null, vendors: { some: { id: user.id } } };
  } else if (user.role === "SHIPYARD" && user.shipyardId) {
    eqWhere = { deletedAt: null, project: { shipyardId: user.shipyardId } };
  } else if (user.role === "ADMIN") {
    eqWhere = { deletedAt: null };
  }

  if (user.role === "VENDOR") {
    pendingReviews = await prisma.equipment.count({
      where: { vendors: { some: { id: user.id } }, status: { in: ["PENDING", "REVISION_REQUESTED"] } },
    });
  }

  vendorEquipment = await prisma.equipment.findMany({
    where: eqWhere,
    include: {
      project: {
        select: {
          id: true,
          vesselName: true,
          classification: true,
          shipyard: { select: { name: true } },
        },
      },
      vendors: { select: { id: true, name: true, company: true } },
      _count: {
        select: {
          hardware: { where: { deletedAt: null } },
          software: { where: { deletedAt: null } },
          certDocuments: { where: { deletedAt: null } },
        },
      },
      dfdDiagram: { select: { id: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  // Admin-only data
  const pendingSignups = user.role === "ADMIN"
    ? await prisma.signupRequest.count({ where: { status: "PENDING" } })
    : 0;

  let adminData: Record<string, unknown> = {};
  if (user.role === "ADMIN") {
    const [shipyards, signupRequests, allVendors, stuckEquipment, recentActivity] = await Promise.all([
      // Shipyards with project counts
      prisma.shipyard.findMany({
        include: {
          _count: { select: { projects: true, users: true } },
          projects: {
            select: {
              id: true, vesselName: true, classification: true, status: true, updatedAt: true,
              _count: { select: { equipments: { where: { deletedAt: null } } } },
              equipments: { where: { deletedAt: null }, select: { status: true } },
            },
          },
        },
        orderBy: { updatedAt: "desc" },
      }),
      // Pending signup requests (detailed)
      prisma.signupRequest.findMany({
        where: { status: "PENDING" },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      // All vendors
      prisma.user.findMany({
        where: { role: "VENDOR" },
        select: { id: true, name: true, company: true, email: true, createdAt: true, updatedAt: true, _count: { select: { assignedEquipments: { where: { deletedAt: null } } } } },
      }),
      // Equipment stuck in review > 7 days
      prisma.equipment.findMany({
        where: { status: { in: ["SUBMITTED", "UNDER_REVIEW"] }, updatedAt: { lte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
        select: { id: true, name: true, status: true, updatedAt: true, project: { select: { id: true, vesselName: true } }, vendors: { select: { name: true, company: true } } },
        take: 10,
      }),
      // Recent activity (last 20 change events)
      prisma.changeEvent.findMany({
        where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, entityType: true, changeType: true, createdAt: true, project: { select: { vesselName: true } } },
      }),
    ]);

    adminData = {
      shipyards: shipyards.map((s) => ({
        id: s.id,
        name: s.name,
        projectCount: s._count.projects,
        userCount: s._count.users,
        projects: s.projects.map((p) => {
          const eqTotal = p._count.equipments;
          const eqApproved = p.equipments.filter((e) => e.status === "APPROVED").length;
          return { id: p.id, vesselName: p.vesselName, classification: p.classification, status: p.status, updatedAt: p.updatedAt.toISOString(), eqTotal, eqApproved };
        }),
      })),
      signupRequests: signupRequests.map((s) => ({ id: s.id, email: s.email, name: s.name, company: s.company, createdAt: s.createdAt.toISOString() })),
      vendors: allVendors.map((v) => ({ id: v.id, name: v.name, company: v.company, email: v.email, eqCount: (v._count as any).assignedEquipments, lastActive: v.updatedAt.toISOString() })),
      stuckEquipment,
      recentActivity: recentActivity.map((a) => ({ id: a.id, type: a.entityType, action: a.changeType, vessel: a.project?.vesselName, createdAt: a.createdAt.toISOString() })),
    };
  }

  return NextResponse.json({
    totalProjects: projects.length,
    pendingReviews,
    pendingSignups,
    complianceScore: avgScore,
    recentChanges,
    userRole: user.role,
    projects: projects.map((p) => ({
      id: p.id,
      vesselName: p.vesselName,
      systemName: p.systemName,
      classification: p.classification,
      shipowner: p.shipowner,
      status: p.status,
      complianceScore: p.complianceScore,
      updatedAt: p.updatedAt.toISOString(),
      _count: p._count,
      projectGroup: (p as unknown as { projectGroup?: { id: string; name: string; shipowner: string | null } }).projectGroup || null,
    })),
    // Vendor equipment list (only populated for VENDOR role)
    equipment: vendorEquipment,
    // Admin-only data
    ...adminData,
    // Legacy alias
    recentProjects: projects.slice(0, 10).map((p) => ({
      id: p.id,
      vesselName: p.vesselName,
      systemName: p.systemName,
      status: p.status,
      complianceScore: p.complianceScore,
      updatedAt: p.updatedAt.toISOString(),
      hwCount: p._count.hardware,
      swCount: p._count.software,
      projectGroup: (p as unknown as { projectGroup?: { id: string; name: string; shipowner: string | null } }).projectGroup || null,
    })),
  });
}
