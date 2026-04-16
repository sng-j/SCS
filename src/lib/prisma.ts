import { prismaRaw, softDeleteExtension } from "./soft-delete";

/**
 * Application-facing Prisma client.
 *
 * This client is extended with the soft-delete behaviour defined in
 * `src/lib/soft-delete.ts`: read operations auto-filter tombstoned rows, and
 * `delete` / `deleteMany` are rewritten into `update` / `updateMany` that
 * stamp `deletedAt`. Existing call sites that use `prisma.x.findMany()` or
 * `prisma.x.delete()` keep working without any changes.
 *
 * When you need to see or hard-remove tombstoned rows (admin recovery tools,
 * the purge cron, backfills), import `prismaRaw` from `./soft-delete` instead
 * — it is a plain PrismaClient with no extension installed.
 */
const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof buildExtended>;
};

function buildExtended() {
  return prismaRaw.$extends(softDeleteExtension());
}

export const prisma = globalForPrisma.prisma ?? buildExtended();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// Re-export the raw client for call sites that need to bypass soft-delete
// (purge scripts, admin undelete, migration backfills).
export { prismaRaw };
