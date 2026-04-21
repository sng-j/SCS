import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, verifyProjectAccess, apiError } from "@/lib/auth-helpers";
import { trackChange } from "@/lib/change-tracker";
import { logAction } from "@/lib/action-logger";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ projectId: string }>;
}

/** GET /api/projects/[projectId]/assessments — list all assessments */
export async function GET(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { projectId } = await params;
  const hasAccess = await verifyProjectAccess(user.id, projectId, user.role, user.shipyardId);
  if (!hasAccess) return apiError("Forbidden", 403);

  const { searchParams } = new URL(request.url);
  const equipmentId = searchParams.get("equipmentId");

  const assessments = await prisma.assessment.findMany({
    where: {
      hardware: equipmentId ? { projectId, equipmentId } : { projectId },
    },
    include: {
      hardware: { select: { id: true, name: true, type: true } },
    },
    orderBy: [{ hardwareId: "asc" }, { checkId: "asc" }],
  });

  return NextResponse.json(assessments);
}

/** POST /api/projects/[projectId]/assessments — upsert a single assessment */
export async function POST(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { projectId } = await params;
  const hasAccess = await verifyProjectAccess(user.id, projectId, user.role, user.shipyardId);
  if (!hasAccess) return apiError("Forbidden", 403);
  // SHIPYARD is a read-only viewer; VENDOR is further restricted below to
  // only their own equipment hardware.
  if (user.role === "SHIPYARD") return apiError("Read-only role cannot record assessments", 403);

  try {
    const body = await request.json();
    const { hardwareId, checkId, standard, result, evidence, note } = body;

    if (!hardwareId || !checkId) {
      return apiError("hardwareId and checkId are required", 400);
    }

    const validResults = ["PASS", "FAIL", "PARTIAL", "NOT_APPLICABLE", "NOT_CHECKED"];
    if (result && !validResults.includes(result)) {
      return apiError("Invalid result", 400);
    }

    // Verify hardware belongs to this project
    const hw = await prisma.hardware.findFirst({
      where: { id: hardwareId, projectId },
      select: {
        id: true,
        equipment: {
          select: {
            vendors: { select: { id: true } },
          },
        },
      },
    });
    if (!hw) return apiError("Hardware not found in project", 404);

    // VENDOR can only assess their own equipment's hardware
    const vendorIds = hw.equipment?.vendors.map(v => v.id) || [];
    if (user.role === "VENDOR" && !vendorIds.includes(user.id)) {
      return apiError("You can only assess your own equipment hardware", 403);
    }

    const assessment = await prisma.assessment.upsert({
      where: {
        hardwareId_checkId: { hardwareId, checkId },
      },
      create: {
        hardwareId,
        checkId,
        standard: standard || "E27",
        result: result || "NOT_CHECKED",
        evidence: evidence || null,
        note: note || null,
      },
      update: {
        ...(result !== undefined && { result }),
        ...(evidence !== undefined && { evidence: evidence || null }),
        ...(note !== undefined && { note: note || null }),
      },
    });

    trackChange({
      projectId, entityType: "ASSESSMENT", entityId: assessment.id,
      changeType: "UPDATE", severity: "MEDIUM",
      changedBy: user.id,
    }).catch(() => {});

    logAction(user.id, "ASSESS_SAVE", { entity: "assessment", projectId, data: { checkId, result } }).catch(() => {});

    return NextResponse.json(assessment);
  } catch {
    return apiError("Failed to save assessment", 500);
  }
}
