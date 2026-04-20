import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { getSessionUser, apiError } from "@/lib/auth-helpers";
import { secureDir } from "@/lib/upload-dir";

export const dynamic = "force-dynamic";

const MIME_MAP: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

interface Params {
  params: Promise<{ filename: string }>;
}

/**
 * Verify the caller is allowed to read the file identified by the serve path.
 * A file is accessible only if it is referenced by a DB record the user owns
 * (or, for ADMIN, any record). Files with no DB reference cannot be served.
 */
async function hasFileAccess(
  servePath: string,
  user: { id: string; role: string; shipyardId: string | null },
): Promise<boolean> {
  // ── QnA attachments ────────────────────────────────────────────────
  const qnaFile = await prisma.qnaFile.findFirst({
    where: { path: servePath },
    select: { qna: { select: { userId: true, targetType: true } } },
  });
  if (qnaFile) {
    if (user.role === "ADMIN") return true;
    // Owner always has access
    if (qnaFile.qna.userId === user.id) return true;
    // Shipyard viewer and Support can view QnAs targeted to them
    if ((user.role === "SHIPYARD" || user.role === "SUPPORT") && qnaFile.qna.targetType === "TO_SHIPYARD") return true;
    return false;
  }

  // ── Vendor audit result files ─────────────────────────────────────
  const auditResult = await prisma.vendorAuditResult.findFirst({
    where: { filePath: servePath },
    select: {
      vendorId: true,
      equipment: { select: { project: { select: { shipyardId: true } } } },
    },
  });
  if (auditResult) {
    if (user.role === "ADMIN") return true;
    if (auditResult.vendorId === user.id) return true;
    // Shipyard viewer and Support can access files belonging to their shipyard's projects
    if (
      (user.role === "SHIPYARD" || user.role === "SUPPORT") &&
      auditResult.equipment?.project?.shipyardId === user.shipyardId
    ) {
      return true;
    }
    return false;
  }

  // File has no DB reference — deny access
  return false;
}

/** GET /api/upload/serve/[filename] — serve an uploaded file (auth + ownership) */
export async function GET(_request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { filename } = await params;

  // Prevent path traversal
  const safeName = path.basename(filename);
  if (safeName !== filename || filename.includes("..")) {
    return apiError("Invalid filename", 400);
  }

  // Authorization: caller must own (or be authorized to access) a DB record
  // that references this file.
  const servePath = `/api/upload/serve/${safeName}`;
  const allowed = await hasFileAccess(servePath, user);
  if (!allowed) return apiError("Forbidden", 403);

  const filePath = path.join(secureDir, safeName);

  try {
    const buffer = await readFile(filePath);
    const ext = safeName.split(".").pop()?.toLowerCase() ?? "";
    const contentType = MIME_MAP[ext] || "application/octet-stream";

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${safeName}"`,
        "Cache-Control": "private, no-cache",
      },
    });
  } catch {
    return apiError("File not found", 404);
  }
}
