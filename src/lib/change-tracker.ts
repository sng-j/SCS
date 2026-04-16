import { prisma } from "@/lib/prisma";

interface TrackChangeParams {
  projectId: string;
  entityType: string; // "HARDWARE" | "SOFTWARE" | "ASSESSMENT" | "DFD" | "DOCUMENT"
  entityId: string;
  changeType: string; // "CREATE" | "UPDATE" | "DELETE"
  severity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  reauditRequired?: boolean;
  diff?: Record<string, unknown>;
  changedBy: string;
}

export async function trackChange(params: TrackChangeParams) {
  const {
    projectId,
    entityType,
    entityId,
    changeType,
    severity = "LOW",
    reauditRequired = false,
    diff,
    changedBy,
  } = params;

  return prisma.changeEvent.create({
    data: {
      projectId,
      entityType,
      entityId,
      changeType,
      severity,
      reauditRequired,
      diff: diff ? JSON.stringify(diff) : undefined,
      changedBy,
    },
  });
}
