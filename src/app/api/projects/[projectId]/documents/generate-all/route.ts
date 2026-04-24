import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, verifyProjectAccess, apiError, isWriteRole } from "@/lib/auth-helpers";
import { ALL_DOC_TYPES, canGenerateDocType } from "@/lib/docx";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ projectId: string }>;
}

/** POST /api/projects/[projectId]/documents/generate-all — generate all documents at once */
export async function POST(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { projectId } = await params;
  const hasAccess = await verifyProjectAccess(user.id, projectId, user.role, user.shipyardId);
  if (!hasAccess) return apiError("Forbidden", 403);
  if (!isWriteRole(user.role)) return apiError("Read-only role cannot modify this resource", 403);

  const body = await request.json();
  const { submissionId, standard, equipmentId } = body as { submissionId: string; standard?: string; equipmentId?: string };

  if (!submissionId) return apiError("submissionId is required", 400);

  // Verify submission belongs to project
  const submission = await prisma.submission.findFirst({
    where: { id: submissionId, projectId },
  });
  if (!submission) return apiError("Submission not found", 404);

  // Filter doc types by standard if specified (e.g., "E27", "E26") AND by
  // the caller's role — a VENDOR must not be able to generate E26/IEC/NIST/
  // ISO documents even if they pass `?standard=E26` explicitly.
  const docTypes = Object.entries(ALL_DOC_TYPES).filter(
    ([key]) =>
      (!standard || key.startsWith(standard)) &&
      canGenerateDocType(user.role, key),
  );

  if (docTypes.length === 0) {
    return apiError("No document types are available for your role in the requested scope", 403);
  }

  const results: { docType: string; title: string; status: "created" | "updated" }[] = [];

  for (const [docType, title] of docTypes) {
    const existing = await prisma.document.findFirst({
      where: { submissionId, docType },
    });

    if (existing) {
      await prisma.document.update({
        where: { id: existing.id },
        data: {
          version: { increment: 1 },
          status: "GENERATED",
          generatedAt: new Date(),
        },
      });
      results.push({ docType, title, status: "updated" });
    } else {
      await prisma.document.create({
        data: {
          submissionId,
          docType,
          title,
          format: "docx",
          status: "GENERATED",
          generatedAt: new Date(),
        },
      });
      results.push({ docType, title, status: "created" });
    }
  }

  return NextResponse.json({
    success: true,
    generated: results.length,
    results,
  });
}
