import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, verifyProjectAccess, apiError } from "@/lib/auth-helpers";
import { scoreRisk } from "@/lib/risk-scoring";

export const dynamic = "force-dynamic";

/**
 * POST /api/projects/[projectId]/risks/generate-from-cve
 * Body (optional): { equipmentId: string } — when present, only CVE matches
 * under that equipment become risks (so the equipment review screen doesn't
 * generate risks for other equipment). Without it we fall back to the full
 * project scope.
 *
 * Dedup is by (cveId, equipmentId) so the same CVE on two different pieces
 * of equipment produces two independent risk entries.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { projectId } = await params;
  const hasAccess = await verifyProjectAccess(user.id, projectId, user.role, user.shipyardId);
  if (!hasAccess) return apiError("Forbidden", 403);
  if (user.role === "SHIPYARD") return apiError("Read-only role cannot generate risks", 403);

  let equipmentId: string | null = null;
  try {
    const body = await request.json().catch(() => ({}));
    if (body && typeof body.equipmentId === "string") equipmentId = body.equipmentId;
  } catch { /* empty body is fine */ }

  if (equipmentId) {
    const eq = await prisma.equipment.findFirst({
      where: { id: equipmentId, projectId },
      select: { id: true },
    });
    if (!eq) return apiError("equipmentId does not belong to this project", 400);
  }

  // Pull software scoped to the requested equipment (or the whole project
  // when no equipmentId was given). We carry hardware.category for the
  // scorer's CAT weighting and hardware.equipmentId so we can persist the
  // risk under the right equipment.
  const software = await prisma.software.findMany({
    where: {
      projectId,
      deletedAt: null,
      ...(equipmentId ? { hardware: { equipmentId } } : {}),
    },
    select: {
      id: true, name: true, version: true,
      hardware: { select: { id: true, name: true, category: true, equipmentId: true } },
      cveMatches: {
        where: { deletedAt: null },
        select: { cveId: true },
      },
    },
  });

  type Ctx = { assetRef: string; hwCategory: string | null; equipmentId: string | null };
  // key = `${cveId}::${equipmentId ?? ""}` so the same CVE on two equipments
  // produces two risks — they're operationally distinct.
  const cveAssetMap = new Map<string, Ctx>();
  for (const sw of software) {
    const hwName = sw.hardware?.name || "";
    const assetRef = hwName ? `${hwName} → ${sw.name}${sw.version ? ` v${sw.version}` : ""}` : `${sw.name}${sw.version ? ` v${sw.version}` : ""}`;
    const eqId = sw.hardware?.equipmentId ?? null;
    for (const match of sw.cveMatches) {
      const key = `${match.cveId}::${eqId ?? ""}`;
      if (!cveAssetMap.has(key)) {
        cveAssetMap.set(key, { assetRef, hwCategory: sw.hardware?.category ?? null, equipmentId: eqId });
      }
    }
  }

  if (cveAssetMap.size === 0) {
    return NextResponse.json({ message: "No CVE matches found", created: 0 });
  }

  // Existing risks keyed by (cveId, equipmentId) within this scope.
  const existingRisks = await prisma.riskEntry.findMany({
    where: {
      projectId,
      cveId: { not: null },
      deletedAt: null,
      ...(equipmentId ? { equipmentId } : {}),
    },
    select: { cveId: true, equipmentId: true },
  });
  const existingKeys = new Set(existingRisks.map(r => `${r.cveId}::${r.equipmentId ?? ""}`));

  const toCreate = [...cveAssetMap.entries()].filter(([key]) => !existingKeys.has(key));
  if (toCreate.length === 0) {
    return NextResponse.json({ message: "All CVE risks already exist", created: 0 });
  }

  // Max threat number runs at the project level so IDs stay unique across equipments.
  const allRisks = await prisma.riskEntry.findMany({
    where: { projectId },
    select: { threatId: true },
    orderBy: { createdAt: "desc" },
  });
  let maxNum = 0;
  for (const r of allRisks) {
    const m = r.threatId.match(/^T-(\d+)$/);
    if (m) maxNum = Math.max(maxNum, parseInt(m[1]));
  }

  const cveIds = [...new Set(toCreate.map(([key]) => key.split("::")[0]))];
  const cveDetails = await prisma.cveLocal.findMany({
    where: { cveId: { in: cveIds } },
    select: { cveId: true, baseScore: true, baseSeverity: true, cvssVector: true, description: true },
  });
  const cveMap = new Map(cveDetails.map(c => [c.cveId, c]));

  const kevHits = await prisma.exploitRef.findMany({
    where: { type: "kev", cveId: { in: cveIds } },
    select: { cveId: true },
  });
  const kevSet = new Set(kevHits.map((k) => k.cveId).filter(Boolean) as string[]);

  let created = 0;
  for (const [key, ctx] of toCreate) {
    const cveId = key.split("::")[0];
    const cve = cveMap.get(cveId);
    if (!cve) continue;

    maxNum++;
    const threatId = `T-${String(maxNum).padStart(3, "0")}`;
    const { likelihood, impact, riskLevel, reasoning } = scoreRisk({
      baseScore: cve.baseScore,
      baseSeverity: cve.baseSeverity,
      cvssVector: cve.cvssVector,
      kevKnown: kevSet.has(cveId),
      hwCategory: ctx.hwCategory,
    });

    await prisma.riskEntry.create({
      data: {
        projectId,
        equipmentId: ctx.equipmentId,
        cveId,
        threatId,
        assetRef: ctx.assetRef || null,
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
