#!/usr/bin/env npx tsx
/**
 * CLI front-end for the data-health diagnostics + auto-fixer.
 *
 * Usage:
 *   npx tsx scripts/data-health.ts            # diagnose only (read-only)
 *   npx tsx scripts/data-health.ts --fix      # diagnose + apply auto-fixes
 *
 * Always run the diagnose pass first to confirm the issues before applying
 * fixes — especially in production. The fixer is conservative (skips items
 * that need operator decisions) but it does mutate data.
 */

import { diagnoseDataHealth, autoFixDataHealth } from "../src/lib/data-health";

async function main() {
  const fix = process.argv.includes("--fix");
  const aggressive = process.argv.includes("--aggressive");

  console.log("[data-health] Running diagnose…");
  const report = await diagnoseDataHealth();
  console.log(`  Found ${report.summary.total} issue(s):`);
  for (const [type, count] of Object.entries(report.summary.byType)) {
    console.log(`    ${type}: ${count}`);
  }
  for (const issue of report.issues) {
    console.log(`  - ${JSON.stringify(issue)}`);
  }

  if (!fix) {
    console.log("\n[data-health] Re-run with --fix to apply safe auto-fixes.");
    return;
  }

  console.log(`\n[data-health] Applying auto-fixes${aggressive ? " (aggressive)" : ""}…`);
  const result = await autoFixDataHealth({ aggressive });
  console.log(`  Applied: ${result.applied.length}`);
  for (const a of result.applied) {
    console.log(`    ✓ ${a.description}`);
  }
  console.log(`  Skipped: ${result.skipped.length}`);
  for (const s of result.skipped) {
    console.log(`    ⚠ ${s.description}`);
    console.log(`      Reason: ${s.reason}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[data-health] Fatal:", err);
    process.exit(1);
  });
