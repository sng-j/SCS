import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, verifyProjectAccess, apiError, isWriteRole } from "@/lib/auth-helpers";
import { safeError } from "@/lib/safe-log";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ projectId: string; documentId: string }>;
}

/** PATCH /api/projects/[projectId]/documents/[documentId] — update document content */
export async function PATCH(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { projectId, documentId } = await params;
  const hasAccess = await verifyProjectAccess(user.id, projectId, user.role, user.shipyardId);
  if (!hasAccess) return apiError("Forbidden", 403);
  if (!isWriteRole(user.role)) return apiError("Read-only role cannot modify this resource", 403);

  try {
    const body = await request.json();
    const { content, status } = body as { content?: string; status?: string };

    if (content === undefined) {
      return apiError("content is required", 400);
    }

    // Verify document belongs to this project
    const document = await prisma.document.findFirst({
      where: { id: documentId, submission: { projectId } },
    });

    if (!document) return apiError("Document not found", 404);

    const updated = await prisma.document.update({
      where: { id: documentId },
      data: {
        content: content,
        status: status === "FINALIZED" ? "FINALIZED" : "EDITED",
        updatedAt: new Date(),
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    safeError("Document PATCH error", error);
    return apiError("Failed to update document", 500);
  }
}
