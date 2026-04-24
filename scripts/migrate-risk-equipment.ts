/**
 * Backfill RiskEntry.equipmentId for rows created before the scope column
 * existed. Resolution order:
 *   1. CVE-based risks: trace cveId → CveMatch (same project) → hardware →
 *      hardware.equipmentId. Most risks land here.
 *   2. Manual risks with assetRef: substring-match against hardware.name and
 *      software.name within the project.
 *   3. Fallback: assign to the first equipment in the project so no risk is
 *      orphaned (user asked for per-equipment attribution; NULL would leave
 *      them invisible in equipment views).
 */

import { prisma } from "../src/lib/prisma";

async function main() {
  const orphans = await prisma.riskEntry.findMany({
    where: { equipmentId: null },
    select: { id: true, projectId: true, cveId: true, assetRef: true, threatId: true },
  });

  if (orphans.length === 0) {
    console.log("No legacy risks to migrate.");
    return;
  }

  console.log(`Migrating ${orphans.length} legacy risks...`);

  const byProject = new Map<string, typeof orphans>();
  for (const r of orphans) {
    if (!byProject.has(r.projectId)) byProject.set(r.projectId, []);
    byProject.get(r.projectId)!.push(r);
  }

  let byCve = 0;
  let byAsset = 0;
  let byFallback = 0;
  let unresolved = 0;

  for (const [projectId, risks] of byProject) {
    const [equipments, hardware, software] = await Promise.all([
      prisma.equipment.findMany({
        where: { projectId },
        select: { id: true, name: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.hardware.findMany({
        where: { projectId, equipmentId: { not: null } },
        select: { id: true, name: true, equipmentId: true },
      }),
      prisma.software.findMany({
        where: { projectId, hardwareId: { not: null } },
        select: { id: true, name: true, hardwareId: true, hardware: { select: { equipmentId: true } } },
      }),
    ]);

    const fallbackEquipmentId = equipments[0]?.id ?? null;

    const cveIds = risks.map((r) => r.cveId).filter(Boolean) as string[];
    const cveMatches = cveIds.length
      ? await prisma.cveMatch.findMany({
          where: {
            cveId: { in: cveIds },
            OR: [
              { hardware: { projectId } },
              { software: { projectId } },
            ],
          },
          select: {
            cveId: true,
            hardware: { select: { equipmentId: true } },
            software: { select: { hardware: { select: { equipmentId: true } } } },
          },
        })
      : [];

    const cveToEquipment = new Map<string, string>();
    for (const m of cveMatches) {
      const eqId = m.hardware?.equipmentId ?? m.software?.hardware?.equipmentId ?? null;
      if (eqId && !cveToEquipment.has(m.cveId)) cveToEquipment.set(m.cveId, eqId);
    }

    for (const risk of risks) {
      let equipmentId: string | null = null;
      let source: "cve" | "asset" | "fallback" | "none" = "none";

      if (risk.cveId && cveToEquipment.has(risk.cveId)) {
        equipmentId = cveToEquipment.get(risk.cveId)!;
        source = "cve";
      }

      if (!equipmentId && risk.assetRef) {
        const asset = risk.assetRef;
        const hwHit = hardware.find((h) => asset.includes(h.name));
        if (hwHit?.equipmentId) {
          equipmentId = hwHit.equipmentId;
          source = "asset";
        } else {
          const swHit = software.find((s) => asset.includes(s.name));
          if (swHit?.hardware?.equipmentId) {
            equipmentId = swHit.hardware.equipmentId;
            source = "asset";
          }
        }
      }

      if (!equipmentId && fallbackEquipmentId) {
        equipmentId = fallbackEquipmentId;
        source = "fallback";
      }

      if (!equipmentId) {
        unresolved++;
        console.warn(`  [unresolved] project=${projectId} threatId=${risk.threatId} (no equipment in project)`);
        continue;
      }

      await prisma.riskEntry.update({
        where: { id: risk.id },
        data: { equipmentId },
      });

      if (source === "cve") byCve++;
      else if (source === "asset") byAsset++;
      else if (source === "fallback") byFallback++;
    }
  }

  console.log(`Done. by-cve=${byCve}, by-asset=${byAsset}, by-fallback=${byFallback}, unresolved=${unresolved}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
