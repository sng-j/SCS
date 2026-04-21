import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, verifyProjectAccess, apiError } from "@/lib/auth-helpers";
import { scoreRisk } from "@/lib/risk-scoring";

export const dynamic = "force-dynamic";

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
  if (user.role === "SHIPYARD") return apiError("Read-only role cannot generate risks", 403);

  // Get all CveMatches for this project's software; carry the host HW's category
  // so the scorer can weight impact by asset criticality (CAT I/II/III).
  const software = await prisma.software.findMany({
    where: { projectId, deletedAt: null },
    select: {
      id: true, name: true, version: true,
      hardware: { select: { id: true, name: true, category: true } },
      cveMatches: {
        where: { deletedAt: null },
        select: { cveId: true },
      },
    },
  });

  // Collect unique CVE IDs with asset info + HW category for scoring
  const cveAssetMap = new Map<string, { assetRef: string; hwCategory: string | null }>();
  for (const sw of software) {
    const hwName = sw.hardware?.name || "";
    const assetRef = hwName ? `${hwName} → ${sw.name}${sw.version ? ` v${sw.version}` : ""}` : `${sw.name}${sw.version ? ` v${sw.version}` : ""}`;
    for (const match of sw.cveMatches) {
      if (!cveAssetMap.has(match.cveId)) {
        cveAssetMap.set(match.cveId, { assetRef, hwCategory: sw.hardware?.category ?? null });
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
    select: { cveId: true, baseScore: true, baseSeverity: true, cvssVector: true, description: true },
  });
  const cveMap = new Map(cveDetails.map(c => [c.cveId, c]));

  // Resolve CISA KEV presence once for all CVEs being generated.
  const kevHits = await prisma.exploitRef.findMany({
    where: { type: "kev", cveId: { in: cveIds } },
    select: { cveId: true },
  });
  const kevSet = new Set(kevHits.map((k) => k.cveId).filter(Boolean) as string[]);

  // Create risk entries
  let created = 0;
  for (const cveId of cveIds) {
    const cve = cveMap.get(cveId);
    if (!cve) continue;

    maxNum++;
    const threatId = `T-${String(maxNum).padStart(3, "0")}`;
    const ctx = cveAssetMap.get(cveId);
    const { likelihood, impact, riskLevel, reasoning } = scoreRisk({
      baseScore: cve.baseScore,
      baseSeverity: cve.baseSeverity,
      cvssVector: cve.cvssVector,
      kevKnown: kevSet.has(cveId),
      hwCategory: ctx?.hwCategory ?? null,
    });

    await prisma.riskEntry.create({
      data: {
        projectId,
        cveId,
        threatId,
        assetRef: ctx?.assetRef || null,
        likelihood,
        impact,
        riskLevel,
        reasoning: JSON.stringify(reasoning),
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
