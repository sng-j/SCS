import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, verifyProjectAccess, apiError } from "@/lib/auth-helpers";
import { generateDocx, canGenerateDocType } from "@/lib/docx";
import archiver from "archiver";
import { PassThrough } from "stream";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ projectId: string }>;
}

/** GET /api/projects/[projectId]/documents/bundle?submissionId=xxx — download all docs as ZIP */
export async function GET(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { projectId } = await params;
  const hasAccess = await verifyProjectAccess(user.id, projectId, user.role, user.shipyardId);
  if (!hasAccess) return apiError("Forbidden", 403);

  const { searchParams } = new URL(request.url);
  const submissionId = searchParams.get("submissionId");
  const equipmentIdParam = searchParams.get("equipmentId") || undefined;

  if (!submissionId) return apiError("submissionId is required", 400);

  // Same guard as the single-document download route — equipmentId must
  // belong to this project. Prevents a caller with project access from
  // scoping bundle content to another equipment's assets.
  let equipmentId: string | undefined;
  if (equipmentIdParam) {
    const eq = await prisma.equipment.findFirst({
      where: { id: equipmentIdParam, projectId },
      select: { id: true },
    });
    if (!eq) return apiError("equipmentId does not belong to this project", 400);
    equipmentId = eq.id;
  }

  // Get all generated documents for this submission
  const documents = await prisma.document.findMany({
    where: { submissionId, status: { not: "DRAFT" } },
    orderBy: { docType: "asc" },
  });

  if (documents.length === 0) {
    return apiError("No generated documents to bundle", 400);
  }

  // Get project info for filename
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

  // Generate each document the caller is allowed to receive and add to the
  // archive. Role-scoped: vendors get E27 only, shipyard/admin get the lot.
  for (const doc of documents) {
    if (!canGenerateDocType(user.role, doc.docType)) continue;
    try {
      const buffer = await generateDocx(projectId, doc.docType, equipmentId);
      const filename = `${doc.docType}_${doc.title.replace(/[^a-zA-Z0-9가-힣_-\s]/g, "").replace(/\s+/g, "_")}.docx`;
      archive.append(buffer, { name: filename });
    } catch (e) {
      // Skip failed documents but log server-side so ops can diagnose.
      console.error(`[documents.bundle] skipped ${doc.docType}:`, e);
    }
  }

  await archive.finalize();

  // Collect all chunks
  const chunks: Buffer[] = [];
  for await (const chunk of passThrough) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const zipBuffer = Buffer.concat(chunks);

  return new NextResponse(zipBuffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${vesselSlug}_documents.zip"`,
      "Content-Length": String(zipBuffer.length),
    },
  });
}
