import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, apiError } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

/** GET /api/admin/audit-tools/runs?projectId=xxx — list audit runs */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);
  if (user.role !== "ADMIN") return apiError("Forbidden", 403);

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");

  if (!projectId) {
    return apiError("projectId is required", 400);
  }

  const runs = await prisma.auditRun.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      platform: true,
      results: true,
      sbomData: true,
      createdAt: true,
    },
  });

  // Extract summary info from results JSON
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapped = runs.map((run: any) => {
    const results = typeof run.results === 'string' ? JSON.parse(run.results) as Record<string, unknown> | null : run.results as Record<string, unknown> | null;
    const sysinfo = (results?.SystemInfo ?? {}) as Record<string, unknown>;
    const isPLC = results?.audit_type === "plc";

    return {
      id: run.id,
      platform: run.platform,
      device: isPLC
        ? (results?.device as string) ?? "PLC"
        : (sysinfo.ComputerName as string) ?? "Unknown",
      os: isPLC ? "PLC" : (sysinfo.OS as string) ?? "",
      runDate: isPLC
        ? (results?.audit_time as string) ?? run.createdAt
        : (sysinfo.AuditTime as string) ?? run.createdAt,
      hasSbom: !!run.sbomData,
      createdAt: run.createdAt,
    };
  });

  return NextResponse.json(mapped);
}

/** DELETE /api/admin/audit-tools/runs?id=xxx — delete an audit run */
export async function DELETE(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);
  if (user.role !== "ADMIN") return apiError("Forbidden", 403);

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) return apiError("id is required", 400);

  await prisma.auditRun.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
