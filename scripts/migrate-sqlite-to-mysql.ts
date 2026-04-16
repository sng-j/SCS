/**
 * SQLite → MySQL data migration script (v2 - Raw SQL)
 *
 * Reads all rows from the SQLite dev.db using sqlite3 CLI,
 * converts types, and inserts directly via raw MySQL queries.
 *
 * Usage: npx tsx scripts/migrate-sqlite-to-mysql.ts
 */

import { PrismaClient } from "@prisma/client";
import { execSync } from "child_process";
import path from "path";

const SQLITE_DB = path.resolve(__dirname, "../prisma/dev.db");
const mysql = new PrismaClient();

// ── Schema metadata: which columns are DateTime or Boolean ──────────────────

const DATETIME_COLS = new Set([
  "createdAt", "updatedAt", "deletedAt", "submittedAt", "generatedAt",
  "publishedAt", "modifiedAt", "expiresAt", "usedAt",
]);

const BOOLEAN_COLS = new Set([
  "isActive", "isRequired", "success", "read", "dismissed",
  "encrypted", "reauditRequired", "isTypeApproved",
]);

// ── Helpers ─────────────────────────────────────────────────────────────────

function sqliteQuery(sql: string): Record<string, unknown>[] {
  try {
    const raw = execSync(
      `sqlite3 -json "${SQLITE_DB}" ${JSON.stringify(sql)}`,
      { maxBuffer: 100 * 1024 * 1024 }
    ).toString();
    if (!raw.trim()) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/**
 * Convert epoch milliseconds (SQLite BigInt) to MySQL DATETIME string.
 */
function epochToDatetime(val: unknown): string | null {
  if (val === null || val === undefined || val === "") return null;
  const num = typeof val === "number" ? val : Number(val);
  if (isNaN(num)) {
    // Maybe it's already a date string
    const d = new Date(val as string);
    if (!isNaN(d.getTime())) {
      return d.toISOString().slice(0, 19).replace("T", " ");
    }
    return null;
  }
  // SQLite Prisma stores as epoch milliseconds
  const d = new Date(num);
  return d.toISOString().slice(0, 19).replace("T", " ");
}

/**
 * Escape a value for MySQL raw INSERT.
 */
function escapeValue(val: unknown, colName: string): string {
  if (val === null || val === undefined) return "NULL";

  if (DATETIME_COLS.has(colName)) {
    const dt = epochToDatetime(val);
    return dt ? `'${dt}'` : "NULL";
  }

  if (BOOLEAN_COLS.has(colName)) {
    return val === 1 || val === true || val === "1" ? "1" : "0";
  }

  if (typeof val === "number") {
    return String(val);
  }

  // String: escape single quotes and backslashes
  const str = String(val)
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\0/g, "");
  return `'${str}'`;
}

// ── Tables in dependency order ──────────────────────────────────────────────

const MIGRATION_ORDER = [
  "Setting",
  "Shipyard",
  "User",
  "LoginAttempt",
  "LoginLog",
  "IpWhitelist",
  "SignupRequest",
  "SecurityLog",
  "ProjectGroup",
  "Project",
  "Equipment",
  "EquipmentTemplate",
  "CertDocument",
  "Hardware",
  "Software",
  "NetworkConnection",
  "DfdDiagram",
  "DfdLog",
  "Assessment",
  "RiskEntry",
  "CveLocal",
  "CveCache",
  "CveMatch",
  "CveSyncState",
  "Submission",
  "Document",
  "DocFormat",
  "SubmissionFile",
  "AuditRun",
  "AuditPassword",
  "AiConversation",
  "AiFeedback",
  "AiNlpLog",
  "CompliancePackage",
  "SocietyChecklist",
  "Faq",
  "Notification",
  "Qna",
  "QnaFile",
  "UserActionLog",
  "ChangeEvent",
  "ImgTemplate",
  "AssetFile",
  "VendorAdvisory",
  "ExploitRef",
  "VendorAuditResult",
];

async function migrateTable(tableName: string) {
  const rows = sqliteQuery(`SELECT * FROM "${tableName}"`);
  if (rows.length === 0) {
    console.log(`  ⏭  ${tableName}: empty`);
    return;
  }

  console.log(`  📦 ${tableName}: ${rows.length} rows...`);

  const columns = Object.keys(rows[0]);
  const colList = columns.map((c) => `\`${c}\``).join(", ");

  let inserted = 0;
  let errors = 0;

  // Insert in batches of 50
  const batchSize = 50;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const valueRows = batch.map((row) => {
      const vals = columns.map((col) => escapeValue(row[col], col));
      return `(${vals.join(", ")})`;
    });

    const sql = `INSERT INTO \`${tableName}\` (${colList}) VALUES ${valueRows.join(",\n")}`;

    try {
      await mysql.$executeRawUnsafe(sql);
      inserted += batch.length;
    } catch (err: unknown) {
      // Try one by one to find problematic rows
      for (const row of batch) {
        const vals = columns.map((col) => escapeValue(row[col], col));
        const singleSql = `INSERT INTO \`${tableName}\` (${colList}) VALUES (${vals.join(", ")})`;
        try {
          await mysql.$executeRawUnsafe(singleSql);
          inserted++;
        } catch (e2: unknown) {
          errors++;
          if (errors <= 2) {
            const msg = e2 instanceof Error ? e2.message : String(e2);
            console.error(`    ❌ ${msg.slice(0, 200)}`);
          }
        }
      }
    }
  }

  const status = errors === 0 ? "✅" : "⚠️";
  console.log(`  ${status} ${tableName}: ${inserted}/${rows.length} inserted${errors > 0 ? ` (${errors} errors)` : ""}`);
}

async function main() {
  console.log("🔄 SQLite → MySQL Migration (Raw SQL)");
  console.log(`   Source: ${SQLITE_DB}\n`);

  // Disable FK checks, unique checks etc for speed
  await mysql.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 0");
  await mysql.$executeRawUnsafe("SET UNIQUE_CHECKS = 0");

  for (const table of MIGRATION_ORDER) {
    await migrateTable(table);
  }

  // Re-enable checks
  await mysql.$executeRawUnsafe("SET UNIQUE_CHECKS = 1");
  await mysql.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 1");

  console.log("\n✅ Migration complete!");
  await mysql.$disconnect();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
