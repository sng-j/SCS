import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, verifyProjectAccess, apiError } from "@/lib/auth-helpers";
import { generateDocx, canGenerateDocType } from "@/lib/docx";
import { generatePdf } from "@/lib/pdf";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ projectId: string; documentId: string }>;
}

/** GET /api/projects/[projectId]/documents/[documentId]/download?format=docx|pdf */
export async function GET(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { projectId, documentId } = await params;
  const hasAccess = await verifyProjectAccess(user.id, projectId, user.role, user.shipyardId);
  if (!hasAccess) return apiError("Forbidden", 403);

  const document = await prisma.document.findFirst({
    where: { id: documentId, submission: { projectId } },
    include: { submission: { select: { projectId: true } } },
  });

  if (!document) return apiError("Document not found", 404);

  // Role-scoped generation: vendors download only their own E27 docs; other
  // standards stay with shipyard / admin roles.
  if (!canGenerateDocType(user.role, document.docType)) {
    return apiError("Your role is not permitted to download this document type", 403);
  }

  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") || "docx";
  const equipmentIdParam = searchParams.get("equipmentId") || undefined;

  // Guard against arbitrary equipmentId — verify it belongs to this project.
  // Without this a caller with project access could pass someone else's
  // equipment and fetchDocumentData would gladly scope to that equipment's
  // assets / risks / DFD instead of the document's own scope.
  let equipmentId: string | undefined;
  if (equipmentIdParam) {
    const eq = await prisma.equipment.findFirst({
      where: { id: equipmentIdParam, projectId },
      select: { id: true },
    });
    if (!eq) return apiError("equipmentId does not belong to this project", 400);
    equipmentId = eq.id;
  }

  try {
    if (format === "pdf") {
      const buffer = await generatePdf(projectId, document.docType, document.title);
      const filename = `${document.docType}_${document.title.replace(/\s+/g, "_")}.pdf`;

      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
          "Content-Length": String(buffer.length),
        },
      });
    }

    // Default: DOCX
    const buffer = await generateDocx(projectId, document.docType, equipmentId);
    const filename = `${document.docType}_${document.title.replace(/\s+/g, "_")}.docx`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch (e) {
    // Don't leak internal error text (could expose enum values, DB state).
    // Log server-side, return a stable user-facing message.
    console.error("[documents.download] generation failed:", e);
    return apiError("Failed to generate document. Please contact support if this persists.", 500);
  }
}
