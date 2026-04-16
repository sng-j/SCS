import { prisma } from "@/lib/prisma";

/**
 * Log user actions for AI training dataset collection.
 * Non-blocking — errors are silently caught.
 */
export async function logAction(
  userId: string,
  action: string,
  opts?: {
    entity?: string;
    entityId?: string;
    projectId?: string;
    data?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    await prisma.userActionLog.create({
      data: {
        userId,
        action,
        entity: opts?.entity,
        entityId: opts?.entityId,
        projectId: opts?.projectId,
        data: opts?.data ? JSON.stringify(opts.data) : null,
      },
    });
  } catch {
    // Silent — logging should never break the main flow
  }
}
