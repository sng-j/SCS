import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getSessionUser, apiError } from "@/lib/auth-helpers";
import { secureDir } from "@/lib/upload-dir";

export const dynamic = "force-dynamic";

const ALLOWED_EXTENSIONS = new Set(["pdf", "docx", "xlsx", "png", "jpg", "jpeg"]);
const ALLOWED_MIMES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/png",
  "image/jpeg",
]);
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

interface Params {
  params: Promise<{ qnaId: string }>;
}

/** POST /api/qna/[qnaId]/files — upload a file attachment for a QnA */
export async function POST(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { qnaId } = await params;

  // Verify QnA exists and user is owner or admin
  const qna = await prisma.qna.findUnique({ where: { id: qnaId } });
  if (!qna) return apiError("QnA not found", 404);
  if (qna.userId !== user.id && user.role !== "ADMIN") {
    return apiError("Forbidden", 403);
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file || typeof file === "string") {
      return apiError("No file provided", 400);
    }

    if (file.size > MAX_SIZE) {
      return apiError("File size exceeds 10MB limit", 400);
    }

    const originalName = file.name;
    const ext = originalName.split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return apiError(
        `File type not allowed. Allowed types: ${[...ALLOWED_EXTENSIONS].join(", ")}`,
        400,
      );
    }

    if (!ALLOWED_MIMES.has(file.type)) {
      return apiError("File MIME type not allowed", 400);
    }

    // Store uploads outside public/ to prevent unauthenticated access
    const uploadsDir = secureDir;
    await mkdir(uploadsDir, { recursive: true });

    // Generate unique filename
    const uniqueName = `${crypto.randomUUID()}.${ext}`;
    const filePath = path.join(uploadsDir, uniqueName);

    // Write file to disk
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await writeFile(filePath, buffer);

    // Create QnaFile record
    const qnaFile = await prisma.qnaFile.create({
      data: {
        qnaId,
        filename: originalName,
        path: `/api/upload/serve/${uniqueName}`,
        mimeType: file.type,
        size: file.size,
      },
    });

    return NextResponse.json(qnaFile, { status: 201 });
  } catch {
    return apiError("Failed to upload file", 500);
  }
}

/** GET /api/qna/[qnaId]/files — list files for a QnA */
export async function GET(_request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { qnaId } = await params;

  const qna = await prisma.qna.findUnique({ where: { id: qnaId } });
  if (!qna) return apiError("QnA not found", 404);

  const files = await prisma.qnaFile.findMany({
    where: { qnaId },
    orderBy: { id: "asc" },
  });

  return NextResponse.json(files);
}

/** DELETE /api/qna/[qnaId]/files?fileId=... — delete a QnA file (owner or admin) */
export async function DELETE(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { qnaId } = await params;
  const { searchParams } = new URL(request.url);
  const fileId = searchParams.get("fileId");

  if (!fileId) return apiError("fileId query parameter is required", 400);

  const qna = await prisma.qna.findUnique({ where: { id: qnaId } });
  if (!qna) return apiError("QnA not found", 404);

  // Only the QnA owner or an admin can delete files
  if (qna.userId !== user.id && user.role !== "ADMIN") {
    return apiError("Forbidden", 403);
  }

  const file = await prisma.qnaFile.findFirst({
    where: { id: Number(fileId), qnaId },
  });
  if (!file) return apiError("File not found", 404);

  await prisma.qnaFile.delete({ where: { id: file.id } });

  return NextResponse.json({ success: true });
}
