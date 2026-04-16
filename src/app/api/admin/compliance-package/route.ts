import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, apiError } from "@/lib/auth-helpers";
import crypto from "crypto";

export const dynamic = "force-dynamic";

/** POST /api/admin/compliance-package — generate a compliance package */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);
  if (user.role !== "ADMIN") return apiError("Forbidden", 403);

  const { projectId, standard } = (await request.json()) as {
    projectId: string;
    standard: "E27" | "E26";
  };

  if (!projectId) {
    return apiError("projectId is required", 400);
  }
  if (!standard || !["E27", "E26"].includes(standard)) {
    return apiError("standard must be E27 or E26", 400);
  }

  // Verify project exists
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      vesselName: true,
      classification: true,
    },
  });

  if (!project) {
    return apiError("Project not found", 404);
  }

  // Calculate compliance score from assessments
  const assessments = await prisma.assessment.findMany({
    where: {
      hardware: { projectId },
      standard: { contains: standard },
    },
    select: {
      result: true,
    },
  });

  const total = assessments.length;
  const passed = assessments.filter((a) => a.result === "PASS").length;
  const score = total > 0 ? Math.round((passed / total) * 10000) / 100 : 0;

  // Build package data
  const packageData = {
    projectId,
    vesselName: project.vesselName,
    classification: project.classification,
    standard,
    score,
    checksPassed: passed,
    checksTotal: total,
    generatedAt: new Date().toISOString(),
    generatedBy: user.email,
  };

  // Generate SHA-256 signature of the package data
  const signature = crypto
    .createHash("sha256")
    .update(JSON.stringify(packageData))
    .digest("hex");

  // Store in database
  const record = await prisma.compliancePackage.create({
    data: {
      projectId,
      standard,
      score,
      checksPassed: passed,
      checksTotal: total,
      signature,
    },
  });

  return NextResponse.json({
    ...record,
    vesselName: project.vesselName,
    classification: project.classification,
  });
}

/** GET /api/admin/compliance-package?projectId=xxx — list packages */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);
  if (user.role !== "ADMIN") return apiError("Forbidden", 403);

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");

  if (!projectId) {
    return apiError("projectId is required", 400);
  }

  const packages = await prisma.compliancePackage.findMany({
    where: { projectId },
    orderBy: { generatedAt: "desc" },
  });

  return NextResponse.json(packages);
}
