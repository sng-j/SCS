import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, verifyProjectAccess, apiError } from "@/lib/auth-helpers";
import { logAction } from "@/lib/action-logger";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ projectId: string }>;
}

/** GET /api/projects/[projectId]/documents — list documents across all submissions */
export async function GET(_request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { projectId } = await params;
  const hasAccess = await verifyProjectAccess(user.id, projectId, user.role, user.shipyardId);
  if (!hasAccess) return apiError("Forbidden", 403);

  const documents = await prisma.document.findMany({
    where: { submission: { projectId } },
    include: {
      submission: { select: { id: true, phase: true, status: true } },
    },
    orderBy: { docType: "asc" },
  });

  return NextResponse.json(documents);
}

/** POST /api/projects/[projectId]/documents — generate a document */
export async function POST(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { projectId } = await params;
  const hasAccess = await verifyProjectAccess(user.id, projectId, user.role, user.shipyardId);
  if (!hasAccess) return apiError("Forbidden", 403);

  try {
    const body = await request.json();
    const { submissionId, docType, title, equipmentId } = body;

    if (!submissionId || !docType || !title) {
      return apiError("submissionId, docType, and title are required", 400);
    }

    // Verify submission belongs to project
    const submission = await prisma.submission.findFirst({
      where: { id: submissionId, projectId },
    });
    if (!submission) return apiError("Submission not found", 404);

    // Check if document already exists for this submission+docType
    const existing = await prisma.document.findFirst({
      where: { submissionId, docType },
    });

    if (existing) {
      // Regenerate — increment version
      const updated = await prisma.document.update({
        where: { id: existing.id },
        data: {
          version: { increment: 1 },
          status: "GENERATED",
          generatedAt: new Date(),
        },
      });

      logAction(user.id, "DOC_GENERATE", { entity: "document", projectId, data: { docType } }).catch(() => {});

      return NextResponse.json(updated);
    }

    const document = await prisma.document.create({
      data: {
        submissionId,
        docType,
        title,
        format: "docx",
        status: "GENERATED",
        generatedAt: new Date(),
      },
    });

    logAction(user.id, "DOC_GENERATE", { entity: "document", projectId, data: { docType } }).catch(() => {});

    return NextResponse.json(document, { status: 201 });
  } catch {
    return apiError("Failed to generate document", 500);
  }
}
