import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, verifyProjectAccess, apiError } from "@/lib/auth-helpers";
import { generateDocx } from "@/lib/docx";
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

  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") || "docx";
  const equipmentId = searchParams.get("equipmentId") || undefined;

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
    const message = e instanceof Error ? e.message : "Failed to generate document";
    return apiError(message, 500);
  }
}
