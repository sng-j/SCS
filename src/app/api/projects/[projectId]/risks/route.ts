import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, verifyProjectAccess, apiError } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ projectId: string }>;
}

/** GET /api/projects/[projectId]/risks — list all risk entries */
export async function GET(_request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { projectId } = await params;
  const hasAccess = await verifyProjectAccess(user.id, projectId, user.role, user.shipyardId);
  if (!hasAccess) return apiError("Forbidden", 403);

  const risks = await prisma.riskEntry.findMany({
    where: { projectId },
    orderBy: [{ riskLevel: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json(risks);
}

/** POST /api/projects/[projectId]/risks — create a risk entry */
export async function POST(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { projectId } = await params;
  const hasAccess = await verifyProjectAccess(user.id, projectId, user.role, user.shipyardId);
  if (!hasAccess) return apiError("Forbidden", 403);
  // SHIPYARD is a read-only viewer — UI already hides the create button but
  // the API layer must also refuse or a crafted request could slip by.
  if (user.role === "SHIPYARD") return apiError("Read-only role cannot create risks", 403);

  try {
    const body = await request.json();
    const { threatId, assetRef, likelihood, impact, mitigation, status } = body;

    if (!threatId) {
      return apiError("threatId is required", 400);
    }

    const likelihoodNum = Number(likelihood);
    const impactNum = Number(impact);

    if (!Number.isInteger(likelihoodNum) || likelihoodNum < 1 || likelihoodNum > 5) {
      return apiError("likelihood must be an integer between 1 and 5", 400);
    }
    if (!Number.isInteger(impactNum) || impactNum < 1 || impactNum > 5) {
      return apiError("impact must be an integer between 1 and 5", 400);
    }

    const validStatuses = ["OPEN", "MITIGATED", "ACCEPTED", "TRANSFERRED"];
    if (status && !validStatuses.includes(status)) {
      return apiError("Invalid status", 400);
    }

    const riskLevel = likelihoodNum * impactNum;

    // Verify project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (!project) return apiError("Project not found", 404);

    const riskEntry = await prisma.riskEntry.create({
      data: {
        projectId,
        threatId,
        assetRef: assetRef || null,
        likelihood: likelihoodNum,
        impact: impactNum,
        riskLevel,
        mitigation: mitigation || null,
        status: status || "OPEN",
      },
    });

    return NextResponse.json(riskEntry, { status: 201 });
  } catch {
    return apiError("Failed to create risk entry", 500);
  }
}
