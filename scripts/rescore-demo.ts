/**
 * Demo: backfill CVSS vectors/parts on the seeded CVEs, mark a few as CISA KEV,
 * then regenerate the CVE-derived RiskEntry rows using the new risk-scoring
 * library so the change in methodology is visible in the UI.
 *
 * Safe to re-run — only affects rows where cveId IS NOT NULL.
 */
import { prisma } from "../src/lib/prisma";
import { scoreRisk } from "../src/lib/risk-scoring";

const PROJECT_ID = "cmo0rn3oe0007mfxhq6ss4dik";

const VECTORS: Record<string, string> = {
  "CVE-2024-38063": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H",
  "CVE-2024-43451": "CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:H/I:N/A:N",
  "CVE-2024-30088": "CVSS:3.1/AV:L/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H",
  "CVE-2024-38080": "CVSS:3.1/AV:L/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H",
  "CVE-2024-38023": "CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H",
  "CVE-2024-26169": "CVSS:3.1/AV:L/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H",
  "CVE-2023-24932": "CVSS:3.1/AV:L/AC:H/PR:L/UI:N/S:U/C:H/I:H/A:H",
  "CVE-2023-21716": "CVSS:3.1/AV:L/AC:L/PR:N/UI:R/S:U/C:H/I:H/A:H",
};
const PARTS: Record<string, "o" | "a" | "h"> = {
  "CVE-2024-38063": "o",
  "CVE-2024-43451": "o",
  "CVE-2024-30088": "o",
  "CVE-2024-38080": "o",
  "CVE-2024-38023": "a",
  "CVE-2024-26169": "o",
  "CVE-2023-24932": "o",
  "CVE-2023-21716": "a",
};
// Three of these are real KEV entries (38080 Hyper-V, 26169 WER, 43451 NTLM).
const KEV_IDS = ["CVE-2024-38080", "CVE-2024-26169", "CVE-2024-43451"];

function expectedPartForSw(swType: string | null): "o" | "a" | "h" | null {
  const t = (swType || "").toUpperCase();
  if (t === "OS" || t === "FIRMWARE") return "o";
  if (t === "APPLICATION" || t === "LIBRARY" || t === "MIDDLEWARE" || t === "DRIVER") return "a";
  return null;
}

async function main() {
  console.log("[rescore] backfilling CVSS vectors + parts…");
  for (const [cveId, vec] of Object.entries(VECTORS)) {
    await prisma.cveLocal.update({
      where: { cveId },
      data: { cvssVector: vec, part: PARTS[cveId] },
    });
  }

  console.log("[rescore] marking KEV entries…");
  for (const cveId of KEV_IDS) {
    await prisma.exploitRef.upsert({
      where: { edbId: `KEV-${cveId}` },
      update: { cveId, title: "KEV (demo)", type: "kev", url: `https://www.cisa.gov/known-exploited-vulnerabilities-catalog#${cveId}` },
      create: { edbId: `KEV-${cveId}`, cveId, title: "KEV (demo)", type: "kev", url: `https://www.cisa.gov/known-exploited-vulnerabilities-catalog#${cveId}` },
    });
  }

  console.log("[rescore] clearing existing CVE-based risks…");
  await prisma.riskEntry.deleteMany({ where: { projectId: PROJECT_ID, cveId: { not: null } } });

  console.log("[rescore] walking software → CVE matches with part filter…");
  const software = await prisma.software.findMany({
    where: { projectId: PROJECT_ID, deletedAt: null },
    select: {
      id: true, name: true, version: true, swType: true,
      hardware: { select: { name: true, category: true } },
      cveMatches: { where: { deletedAt: null }, select: { cveId: true } },
    },
  });

  const cveAssetMap = new Map<string, { assetRef: string; hwCategory: string | null }>();
  const skipped: string[] = [];
  for (const sw of software) {
    const exp = expectedPartForSw(sw.swType);
    const hwName = sw.hardware?.name || "";
    const assetRef = hwName
      ? `${hwName} → ${sw.name}${sw.version ? ` v${sw.version}` : ""}`
      : sw.name;
    for (const m of sw.cveMatches) {
      const cvePart = PARTS[m.cveId];
      if (exp && cvePart && cvePart !== exp) {
        skipped.push(`${m.cveId} (part=${cvePart}) ≠ ${sw.name} (expects ${exp})`);
        continue;
      }
      if (!cveAssetMap.has(m.cveId)) {
        cveAssetMap.set(m.cveId, { assetRef, hwCategory: sw.hardware?.category ?? null });
      }
    }
  }
  if (skipped.length) {
    console.log(`[rescore] ${skipped.length} match(es) dropped by part filter:`);
    for (const s of skipped) console.log(`  - ${s}`);
  }

  const allRisks = await prisma.riskEntry.findMany({
    where: { projectId: PROJECT_ID },
    select: { threatId: true },
  });
  let maxNum = 0;
  for (const r of allRisks) {
    const m = r.threatId.match(/^T-(\d+)$/);
    if (m) maxNum = Math.max(maxNum, parseInt(m[1]));
  }

  const ids = [...cveAssetMap.keys()];
  const details = await prisma.cveLocal.findMany({
    where: { cveId: { in: ids } },
    select: { cveId: true, baseScore: true, baseSeverity: true, cvssVector: true },
  });
  const kevSet = new Set(KEV_IDS);

  for (const cve of details) {
    const ctx = cveAssetMap.get(cve.cveId)!;
    const { likelihood, impact, riskLevel, reasoning } = scoreRisk({
      baseScore: cve.baseScore,
      baseSeverity: cve.baseSeverity,
      cvssVector: cve.cvssVector,
      kevKnown: kevSet.has(cve.cveId),
      hwCategory: ctx.hwCategory,
    });
    maxNum++;
    await prisma.riskEntry.create({
      data: {
        projectId: PROJECT_ID,
        cveId: cve.cveId,
        threatId: `T-${String(maxNum).padStart(3, "0")}`,
        assetRef: ctx.assetRef,
        likelihood,
        impact,
        riskLevel,
        reasoning: JSON.stringify(reasoning),
        status: "OPEN",
      },
    });
  }

  console.log("\n[rescore] result:");
  const risks = await prisma.riskEntry.findMany({
    where: { projectId: PROJECT_ID, cveId: { not: null }, deletedAt: null },
    orderBy: { riskLevel: "desc" },
  });
  console.table(
    risks.map((r) => ({
      tid: r.threatId,
      cve: r.cveId,
      L: r.likelihood,
      I: r.impact,
      score: r.riskLevel,
      kev: kevSet.has(r.cveId || "") ? "🔥" : "",
    })),
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
