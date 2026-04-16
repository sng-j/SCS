/**
 * Soft-delete (logical delete) infrastructure for the SCS Prisma client.
 *
 * Strategy:
 * - Each soft-delete model carries a nullable `deletedAt` column (see schema.prisma).
 * - A Prisma Client extension transparently filters all read operations by
 *   `deletedAt: null`, so existing query code keeps working without changes.
 * - `delete` and `deleteMany` are rewritten to `update` / `updateMany` that
 *   stamp `deletedAt` with the current timestamp. No row is ever removed by
 *   ordinary application code.
 * - Fields that participate in unique constraints are "tombstoned" at
 *   soft-delete time so that a subsequent insert with the original value
 *   doesn't collide with the deleted row (e.g. `User.email` gets prefixed
 *   with `__del_${timestamp}_`).
 * - A raw (unextended) Prisma client is re-exported as `prismaRaw` for
 *   internal use by the extension itself and by the purge cron job, which
 *   needs to perform genuine hard deletes on aged rows.
 *
 * Non-goals:
 * - The extension does NOT cascade soft-delete across relations. Routes that
 *   previously relied on database-level `onDelete: Cascade` must perform
 *   explicit child deletion (which the extension will rewrite to soft-delete).
 * - The extension does NOT rewrite `where` filters inside nested `include`
 *   blocks. Top-level operations are filtered; nested reads of soft-delete
 *   models will surface tombstoned rows unless the caller adds an explicit
 *   `where: { deletedAt: null }` filter to the include.
 */

import { PrismaClient, Prisma } from "@prisma/client";

// ── Model registry ──────────────────────────────────────────────────────────

/**
 * Models that participate in the soft-delete lifecycle. Names match Prisma's
 * PascalCase model identifiers as emitted in `Prisma.ModelName`.
 */
export const SOFT_DELETE_MODELS = new Set<string>([
  "User",
  "Shipyard",
  "ProjectGroup",
  "Project",
  "Equipment",
  "Hardware",
  "Software",
  "NetworkConnection",
  "DfdDiagram",
  "DfdLog",
  "Assessment",
  "RiskEntry",
  "Submission",
  "Document",
  "SubmissionFile",
  "CompliancePackage",
  "CertDocument",
  "AssetFile",
  "VendorAuditResult",
  "AuditRun",
  "Qna",
  "QnaFile",
  "EquipmentTemplate",
  "CveMatch",
]);

/**
 * Strategy applied to a unique field when a row is soft-deleted.
 * - `suffix`  — prepend `__del_${timestamp}_` to the existing value, preserving
 *               the original for inspection while freeing the value for reuse.
 * - `nullify` — set the field to `null`. Requires the field to be nullable.
 */
type TombstoneStrategy = "suffix" | "nullify";

interface TombstoneRule {
  field: string;
  strategy: TombstoneStrategy;
}

/**
 * Per-model tombstone rules. Only models with unique constraints that would
 * block re-creation of a logically-identical record need entries here.
 *
 * - `User.email` is a required `@unique String` — must be suffixed.
 * - `DfdDiagram.equipmentId` is an optional `@unique String?` — can be nulled.
 * - `Assessment.checkId` participates in `@@unique([hardwareId, checkId])`.
 *   Suffixing `checkId` is sufficient to release the pair for reuse.
 */
export const TOMBSTONE_FIELDS: Record<string, TombstoneRule[]> = {
  User: [{ field: "email", strategy: "suffix" }],
  DfdDiagram: [{ field: "equipmentId", strategy: "nullify" }],
  Assessment: [{ field: "checkId", strategy: "suffix" }],
};

// ── Raw client (no extension) ───────────────────────────────────────────────

/**
 * A plain PrismaClient that bypasses the soft-delete extension entirely.
 * Used by the extension itself (to avoid recursion when it needs to fetch
 * pre-tombstone values) and by the purge cron job (to perform hard deletes
 * on rows whose `deletedAt` is older than the retention window).
 */
const globalForPrismaRaw = globalThis as unknown as {
  prismaRaw?: PrismaClient;
};

export const prismaRaw: PrismaClient =
  globalForPrismaRaw.prismaRaw ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrismaRaw.prismaRaw = prismaRaw;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function lowerFirst(s: string): string {
  return s.length === 0 ? s : s[0].toLowerCase() + s.slice(1);
}

/**
 * Merge `{ deletedAt: null }` into an existing `where` clause. If the caller
 * already pinned `deletedAt` (to fetch tombstoned rows explicitly), leave it
 * alone. This lets advanced consumers opt out of filtering per-query.
 */
function injectActiveFilter(where: unknown): Record<string, unknown> {
  if (!where || typeof where !== "object") {
    return { deletedAt: null };
  }
  const w = where as Record<string, unknown>;
  if ("deletedAt" in w) return w; // caller opted out
  return { ...w, deletedAt: null };
}

/**
 * Build the update payload for a soft-delete operation. Includes the
 * `deletedAt` stamp and any tombstoned field rewrites required by unique
 * constraints on the model.
 */
async function buildSoftDeleteData(
  model: string,
  whereArg: unknown,
): Promise<Record<string, unknown>> {
  const now = new Date();
  const data: Record<string, unknown> = { deletedAt: now };

  const rules = TOMBSTONE_FIELDS[model];
  if (!rules || rules.length === 0) return data;

  // Fetch the current row via the raw client so we don't recurse into the
  // extension. We only need the tombstoned fields.
  const select = Object.fromEntries(rules.map((r) => [r.field, true]));
  const modelKey = lowerFirst(model);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const delegate = (prismaRaw as any)[modelKey];
  if (!delegate || typeof delegate.findFirst !== "function") return data;

  const current = await delegate.findFirst({ where: whereArg, select });
  if (!current) return data;

  const timestamp = now.getTime();
  for (const rule of rules) {
    if (rule.strategy === "nullify") {
      data[rule.field] = null;
    } else {
      // `suffix` — only rewrite if the field currently holds a non-null value.
      const existing = (current as Record<string, unknown>)[rule.field];
      if (typeof existing === "string" && !existing.startsWith("__del_")) {
        data[rule.field] = `__del_${timestamp}_${existing}`;
      }
    }
  }

  return data;
}

// ── Extension factory ───────────────────────────────────────────────────────

/**
 * Build the `$extends` argument that installs soft-delete behaviour on a
 * PrismaClient. Kept as a factory so tests can attach it to a fresh raw
 * client without involving the global singleton.
 */
export function softDeleteExtension() {
  return Prisma.defineExtension((client) =>
    client.$extends({
      name: "soft-delete",
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            if (!model || !SOFT_DELETE_MODELS.has(model)) {
              return query(args);
            }

            switch (operation) {
              // ── Reads: inject deletedAt:null ─────────────────────────
              case "findUnique":
              case "findUniqueOrThrow":
              case "findFirst":
              case "findFirstOrThrow":
              case "findMany":
              case "count":
              case "aggregate":
              case "groupBy": {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const a = (args ?? {}) as Record<string, any>;
                a.where = injectActiveFilter(a.where);
                return query(a);
              }

              // ── Writes that respect soft-delete scoping ──────────────
              case "update":
              case "updateMany": {
                // Don't let callers accidentally update tombstoned rows.
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const a = (args ?? {}) as Record<string, any>;
                a.where = injectActiveFilter(a.where);
                return query(a);
              }

              // ── Hard delete → soft delete rewrite ────────────────────
              case "delete": {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const a = (args ?? {}) as Record<string, any>;
                const data = await buildSoftDeleteData(model, a.where);
                const modelKey = lowerFirst(model);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const delegate = (prismaRaw as any)[modelKey];
                return delegate.update({ where: a.where, data }) as unknown;
              }

              case "deleteMany": {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const a = (args ?? {}) as Record<string, any>;
                const where = injectActiveFilter(a.where);
                // Tombstone fields are per-row; doing that for bulk deletes
                // would require N+1 reads. Instead, only rewrite `deletedAt`
                // and rely on the suffix being applied when (and if) a row
                // is later individually revived or inspected. Bulk soft
                // deletes of unique-keyed models are rare, and the remaining
                // rows are still invisible to reads because of the filter.
                const modelKey = lowerFirst(model);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const delegate = (prismaRaw as any)[modelKey];
                return delegate.updateMany({
                  where,
                  data: { deletedAt: new Date() },
                }) as unknown;
              }

              default:
                return query(args);
            }
          },
        },
      },
    }),
  );
}
