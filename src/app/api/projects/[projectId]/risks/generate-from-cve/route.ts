import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, verifyProjectAccess, apiError } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

/** Convert CVSS baseScore → likelihood (1-5) */
function scoreToLikelihood(score: number | null): number {
  if (!score) return 1;
  if (score >= 9.0) return 5;
  if (score >= 7.0) return 4;
  if (score >= 4.0) return 3;
  if (score >= 2.0) return 2;
  return 1;
}

/** Convert baseSeverity → impact (1-5) */
function severityToImpact(severity: string | null): number {
  switch (severity?.toUpperCase()) {
    case "CRITICAL": return 5;
    case "HIGH": return 4;
    case "MEDIUM": return 3;
    case "LOW": return 2;
    default: return 1;
  }
}

/** POST /api/projects/[projectId]/risks/generate-from-cve */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { projectId } = await params;
  const hasAccess = await verifyProjectAccess(user.id, projectId, user.role, user.shipyardId);
  if (!hasAccess) return apiError("Forbidden", 403);

  // Get all CveMatches for this project's software
  const software = await prisma.software.findMany({
    where: { projectId, deletedAt: null },
    select: {
      id: true, name: true, version: true,
      hardware: { select: { id: true, name: true } },
      cveMatches: {
        where: { deletedAt: null },
        select: { cveId: true },
      },
    },
  });

  // Collect unique CVE IDs with asset info
  const cveAssetMap = new Map<string, string>(); // cveId → assetRef
  for (const sw of software) {
    const hwName = sw.hardware?.name || "";
    const assetRef = hwName ? `${hwName} → ${sw.name}${sw.version ? ` v${sw.version}` : ""}` : `${sw.name}${sw.version ? ` v${sw.version}` : ""}`;
    for (const match of sw.cveMatches) {
      if (!cveAssetMap.has(match.cveId)) {
        cveAssetMap.set(match.cveId, assetRef);
      }
    }
  }

  if (cveAssetMap.size === 0) {
    return NextResponse.json({ message: "No CVE matches found", created: 0 });
  }

  // Check existing CVE-based risks to avoid duplicates
  const existingRisks = await prisma.riskEntry.findMany({
    where: { projectId, cveId: { not: null }, deletedAt: null },
    select: { cveId: true },
  });
  const existingCveIds = new Set(existingRisks.map(r => r.cveId));

  // Get max threat number for auto-numbering
  const allRisks = await prisma.riskEntry.findMany({
    where: { projectId },
    select: { threatId: true },
    orderBy: { createdAt: "desc" },
  });
  let maxNum = 0;
  for (const r of allRisks) {
    const match = r.threatId.match(/^T-(\d+)$/);
    if (match) maxNum = Math.max(maxNum, parseInt(match[1]));
  }

  // Fetch CVE details for all needed CVEs
  const cveIds = [...cveAssetMap.keys()].filter(id => !existingCveIds.has(id));
  if (cveIds.length === 0) {
    return NextResponse.json({ message: "All CVE risks already exist", created: 0 });
  }

  const cveDetails = await prisma.cveLocal.findMany({
    where: { cveId: { in: cveIds } },
    select: { cveId: true, baseScore: true, baseSeverity: true, description: true },
  });
  const cveMap = new Map(cveDetails.map(c => [c.cveId, c]));

  // Create risk entries
  let created = 0;
  for (const cveId of cveIds) {
    const cve = cveMap.get(cveId);
    if (!cve) continue;

    maxNum++;
    const threatId = `T-${String(maxNum).padStart(3, "0")}`;
    const likelihood = scoreToLikelihood(cve.baseScore);
    const impact = severityToImpact(cve.baseSeverity);

    await prisma.riskEntry.create({
      data: {
        projectId,
        cveId,
        threatId,
        assetRef: cveAssetMap.get(cveId) || null,
        likelihood,
        impact,
        riskLevel: likelihood * impact,
        status: "OPEN",
      },
    });
    created++;
  }

  return NextResponse.json({
    message: `Generated ${created} risks from CVEs`,
    created,
    total: cveAssetMap.size,
    skipped: cveAssetMap.size - created,
  });
}
