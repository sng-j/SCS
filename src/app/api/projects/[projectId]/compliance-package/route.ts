import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getSessionUser,
  verifyProjectAccess,
  apiError,
} from "@/lib/auth-helpers";
import crypto from "crypto";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ projectId: string }>;
}

/** POST /api/projects/[projectId]/compliance-package — generate compliance package */
export async function POST(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { projectId } = await params;
  const hasAccess = await verifyProjectAccess(user.id, projectId, user.role, user.shipyardId);
  if (!hasAccess) return apiError("Forbidden", 403);

  let standard = "E27";
  try {
    const body = await request.json();
    if (body?.standard && ["E27", "E26"].includes(body.standard)) {
      standard = body.standard;
    }
  } catch {
    // No body or invalid JSON — use default E27
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, vesselName: true, classification: true, systemName: true },
  });
  if (!project) return apiError("Project not found", 404);

  // Fetch assessments
  const assessments = await prisma.assessment.findMany({
    where: { hardware: { projectId }, standard: { contains: standard } },
    select: {
      checkId: true,
      standard: true,
      result: true,
      note: true,
      hardware: { select: { name: true, type: true, zone: true } },
    },
  });

  const total = assessments.length;
  const passed = assessments.filter((a) => a.result === "PASS").length;
  const score = total > 0 ? Math.round((passed / total) * 10000) / 100 : 0;

  // Fetch software count (SBOM)
  const swCount = await prisma.software.count({ where: { projectId } });

  // Fetch CVE match count with severity from CveLocal
  const cveMatches = await prisma.cveMatch.findMany({
    where: { software: { projectId } },
    select: { cveId: true },
  });
  // Look up severities from CveLocal
  const cveIds = [...new Set(cveMatches.map((c) => c.cveId))];
  let cveCritical = 0;
  let cveHigh = 0;
  if (cveIds.length > 0) {
    const cveDetails = await prisma.cveLocal.findMany({
      where: { cveId: { in: cveIds } },
      select: { baseSeverity: true },
    });
    cveCritical = cveDetails.filter((c) => c.baseSeverity === "CRITICAL").length;
    cveHigh = cveDetails.filter((c) => c.baseSeverity === "HIGH").length;
  }

  // Build package payload for hashing
  const packagePayload = {
    projectId,
    vesselName: project.vesselName,
    standard,
    score,
    checksPassed: passed,
    checksTotal: total,
    sbomCount: swCount,
    cveCritical,
    cveHigh,
    generatedAt: new Date().toISOString(),
    generatedBy: user.email,
  };

  const signature = crypto
    .createHash("sha256")
    .update(JSON.stringify(packagePayload))
    .digest("hex");

  // Delete old packages for this project+standard, keep only latest
  await prisma.compliancePackage.deleteMany({
    where: { projectId, standard },
  });

  const record = await prisma.compliancePackage.create({
    data: {
      projectId,
      standard,
      score,
      checksPassed: passed,
      checksTotal: total,
      signature,
      signedBy: user.email || user.name,
      signedByOrg: user.company || null,
    },
  });

  return NextResponse.json({
    id: record.id,
    sha256: record.signature,
    createdAt: record.generatedAt,
    downloadUrl: `/api/projects/${projectId}/compliance-package/download?id=${record.id}`,
    standard: record.standard,
    score: record.score,
    checksPassed: record.checksPassed,
    checksTotal: record.checksTotal,
    vesselName: project.vesselName,
    classification: project.classification,
    sbomCount: swCount,
    cveCritical,
    cveHigh,
  });
}

/** GET /api/projects/[projectId]/compliance-package — list packages */
export async function GET(_request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { projectId } = await params;
  const hasAccess = await verifyProjectAccess(user.id, projectId, user.role, user.shipyardId);
  if (!hasAccess) return apiError("Forbidden", 403);

  const packages = await prisma.compliancePackage.findMany({
    where: { projectId },
    orderBy: { generatedAt: "desc" },
  });

  // Map DB fields to frontend interface
  const mapped = packages.map((p) => ({
    id: p.id,
    sha256: p.signature,
    createdAt: p.generatedAt,
    downloadUrl: `/api/projects/${projectId}/compliance-package/download?id=${p.id}`,
    standard: p.standard,
    score: p.score,
    checksPassed: p.checksPassed,
    checksTotal: p.checksTotal,
  }));

  return NextResponse.json(mapped);
}
