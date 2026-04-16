#!/usr/bin/env npx tsx
/**
 * Purge soft-deleted rows older than the retention window.
 *
 * Usage:
 *   npx tsx scripts/purge-soft-deleted.ts           # default 90 days
 *   npx tsx scripts/purge-soft-deleted.ts --days 30 # custom retention
 *   npx tsx scripts/purge-soft-deleted.ts --dry-run # preview only
 *
 * Schedule with cron (e.g. nightly at 3 AM):
 *   0 3 * * * cd /home/cytur/SCS && npx tsx scripts/purge-soft-deleted.ts >> logs/purge.log 2>&1
 *
 * This script uses the RAW Prisma client (no soft-delete extension) so that
 * `delete` / `deleteMany` perform genuine hard deletes.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ── Purge order ─────────────────────────────────────────────────────────────
// Children first, parents last — respects foreign key constraints.
// Each entry is a [modelName, prismaDelegate] pair.

type Delegate = {
  deleteMany: (args: { where: { deletedAt: { lt: Date } } }) => Promise<{ count: number }>;
};

function delegates(p: PrismaClient) {
  // Order: deepest children first → parents last.
  const list: [string, Delegate][] = [
    // Leaf models (no children)
    ["CveMatch", p.cveMatch],
    ["AssetFile", p.assetFile],
    ["Assessment", p.assessment],
    ["DfdLog", p.dfdLog],
    ["NetworkConnection", p.networkConnection],
    ["SubmissionFile", p.submissionFile],
    ["Document", p.document],
    ["CompliancePackage", p.compliancePackage],
    ["RiskEntry", p.riskEntry],
    ["CertDocument", p.certDocument],
    ["VendorAuditResult", p.vendorAuditResult],
    ["AuditRun", p.auditRun],
    ["QnaFile", p.qnaFile],
    ["EquipmentTemplate", p.equipmentTemplate],
    // Mid-level
    ["Software", p.software],
    ["Hardware", p.hardware],
    ["DfdDiagram", p.dfdDiagram],
    ["Submission", p.submission],
    ["Qna", p.qna],
    ["Equipment", p.equipment],
    // Parents
    ["Project", p.project],
    ["ProjectGroup", p.projectGroup],
    ["User", p.user],
    ["Shipyard", p.shipyard],
  ];
  return list;
}

// ── CLI ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const daysIdx = args.indexOf("--days");
  const retentionDays = daysIdx >= 0 ? parseInt(args[daysIdx + 1]) || 90 : 90;
  const dryRun = args.includes("--dry-run");

  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  console.log(
    `[purge] ${dryRun ? "(DRY RUN) " : ""}Purging rows soft-deleted before ${cutoff.toISOString()} (${retentionDays}-day retention)`,
  );

  let totalPurged = 0;

  for (const [name, delegate] of delegates(prisma)) {
    try {
      if (dryRun) {
        // Count only — no actual delete.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const count = await (delegate as any).count({
          where: { deletedAt: { lt: cutoff } },
        });
        if (count > 0) {
          console.log(`  [dry] ${name}: ${count} rows would be purged`);
          totalPurged += count;
        }
      } else {
        const result = await delegate.deleteMany({
          where: { deletedAt: { lt: cutoff } },
        });
        if (result.count > 0) {
          console.log(`  ${name}: ${result.count} rows purged`);
          totalPurged += result.count;
        }
      }
    } catch (err) {
      // Some models may fail due to FK constraints if a parent wasn't
      // purged yet. Log and continue — next run will clean up.
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`  [warn] ${name}: ${msg.slice(0, 120)}`);
    }
  }

  console.log(`[purge] Done. Total: ${totalPurged} rows ${dryRun ? "would be " : ""}purged.`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[purge] Fatal:", err);
  process.exit(1);
});
