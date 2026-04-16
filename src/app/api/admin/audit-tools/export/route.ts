import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, apiError } from "@/lib/auth-helpers";
import archiver from "archiver";
import { PassThrough } from "stream";

export const dynamic = "force-dynamic";

/** GET /api/admin/audit-tools/export?projectId=xxx — export all audit runs as ZIP */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);
  if (user.role !== "ADMIN") return apiError("Forbidden", 403);

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");

  if (!projectId) return apiError("projectId is required", 400);

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

  if (runs.length === 0) {
    return apiError("No audit runs to export", 400);
  }

  // Get project name for filename
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { vesselName: true },
  });
  const vesselSlug = (project?.vesselName ?? "project")
    .replace(/[^a-zA-Z0-9가-힣_-]/g, "_")
    .substring(0, 40);

  // Create ZIP archive
  const archive = archiver("zip", { zlib: { level: 9 } });
  const passThrough = new PassThrough();
  archive.pipe(passThrough);

  for (const run of runs) {
    const results = typeof run.results === 'string' ? JSON.parse(run.results) as Record<string, unknown> | null : run.results as Record<string, unknown> | null;
    const sysinfo = (results?.SystemInfo ?? {}) as Record<string, unknown>;
    const isPLC = results?.audit_type === "plc";
    const device = isPLC
      ? (results?.device as string) ?? "PLC"
      : (sysinfo.ComputerName as string) ?? "Unknown";
    const dateStr = new Date(run.createdAt).toISOString().slice(0, 10);
    const safeDevice = device.replace(/[^a-zA-Z0-9가-힣_-]/g, "_");

    // Add full results JSON
    if (results) {
      archive.append(JSON.stringify(results, null, 2), {
        name: `${safeDevice}_${dateStr}/audit_results.json`,
      });
    }

    // Add SBOM data if present
    if (run.sbomData) {
      const sbomData = typeof run.sbomData === 'string' ? JSON.parse(run.sbomData) : run.sbomData;
      archive.append(JSON.stringify(sbomData, null, 2), {
        name: `${safeDevice}_${dateStr}/sbom_data.json`,
      });
    }

    // Generate E27 summary text
    const e27 = results?.e27 as { items?: { id: string; label: string; pass: boolean }[]; score?: { pass: number; fail: number; total: number } } | undefined;
    if (e27?.items) {
      const lines = [
        `E27 Security Configuration Assessment Report`,
        `Device: ${device}`,
        `Platform: ${run.platform || "Unknown"}`,
        `Date: ${dateStr}`,
        ``,
        `Score: ${e27.score?.pass ?? 0}/${e27.score?.total ?? 0} PASS`,
        ``,
        `--- Check Results ---`,
        ...e27.items.map((item) => `[${item.pass ? "PASS" : "FAIL"}] ${item.id}: ${item.label}`),
      ];
      archive.append(lines.join("\n"), {
        name: `${safeDevice}_${dateStr}/e27_summary.txt`,
      });
    }
  }

  await archive.finalize();

  // Collect chunks
  const chunks: Buffer[] = [];
  for await (const chunk of passThrough) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const zipBuffer = Buffer.concat(chunks);

  return new NextResponse(zipBuffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${vesselSlug}_audit_export.zip"`,
      "Content-Length": String(zipBuffer.length),
    },
  });
}
