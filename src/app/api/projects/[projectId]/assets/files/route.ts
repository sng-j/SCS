import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getSessionUser,
  verifyProjectAccess,
  apiError,
  isWriteRole,
} from "@/lib/auth-helpers";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { assetFilesDir } from "@/lib/upload-dir";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ projectId: string }>;
}

const UPLOAD_DIR = assetFilesDir;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_EXTENSIONS = [
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".txt",
  ".csv",
  ".zip",
  ".bmp",
  ".svg",
];

/** GET /api/projects/[projectId]/assets/files — list files for an asset */
export async function GET(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { projectId } = await params;
  const hasAccess = await verifyProjectAccess(user.id, projectId, user.role, user.shipyardId);
  if (!hasAccess) return apiError("Forbidden", 403);

  const { searchParams } = new URL(request.url);
  const hardwareId = searchParams.get("hardwareId");
  const softwareId = searchParams.get("softwareId");

  if (!hardwareId && !softwareId) {
    return apiError("hardwareId or softwareId is required", 400);
  }

  // Verify the asset belongs to this project
  if (hardwareId) {
    const hw = await prisma.hardware.findFirst({
      where: { id: hardwareId, projectId },
      select: { id: true },
    });
    if (!hw) return apiError("Hardware not found in this project", 404);
  }
  if (softwareId) {
    const sw = await prisma.software.findFirst({
      where: { id: softwareId, projectId },
      select: { id: true },
    });
    if (!sw) return apiError("Software not found in this project", 404);
  }

  const files = await prisma.assetFile.findMany({
    where: {
      ...(hardwareId ? { hardwareId } : {}),
      ...(softwareId ? { softwareId } : {}),
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(files);
}

/** POST /api/projects/[projectId]/assets/files — upload file for an asset */
export async function POST(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { projectId } = await params;
  const hasAccess = await verifyProjectAccess(user.id, projectId, user.role, user.shipyardId);
  if (!hasAccess) return apiError("Forbidden", 403);
  if (!isWriteRole(user.role)) return apiError("Read-only role cannot modify this resource", 403);

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const hardwareId = formData.get("hardwareId") as string | null;
    const softwareId = formData.get("softwareId") as string | null;

    if (!file) {
      return apiError("No file provided", 400);
    }

    if (!hardwareId && !softwareId) {
      return apiError("hardwareId or softwareId is required", 400);
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return apiError("File size exceeds 10MB limit", 400);
    }

    // Validate file extension
    const ext = path.extname(file.name).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return apiError(
        `File type not allowed. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`,
        400
      );
    }

    // Verify the asset belongs to this project
    if (hardwareId) {
      const hw = await prisma.hardware.findFirst({
        where: { id: hardwareId, projectId },
        select: { id: true },
      });
      if (!hw) return apiError("Hardware not found in this project", 404);
    }
    if (softwareId) {
      const sw = await prisma.software.findFirst({
        where: { id: softwareId, projectId },
        select: { id: true },
      });
      if (!sw) return apiError("Software not found in this project", 404);
    }

    // Ensure upload directory exists
    const projectDir = path.join(UPLOAD_DIR, projectId);
    await mkdir(projectDir, { recursive: true });

    // Generate unique filename with random prefix to prevent prediction
    const randomPrefix = crypto.randomUUID().slice(0, 8);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filename = `${randomPrefix}_${safeName}`;
    const filePath = path.join(projectDir, filename);

    // Write file to disk
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await writeFile(filePath, buffer);

    // Store relative path in DB
    const relativePath = `uploads/asset-files/${projectId}/${filename}`;

    const assetFile = await prisma.assetFile.create({
      data: {
        hardwareId: hardwareId || null,
        softwareId: softwareId || null,
        filename: file.name,
        path: relativePath,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
      },
    });

    return NextResponse.json(assetFile, { status: 201 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to upload file";
    return apiError(message, 500);
  }
}

/** DELETE /api/projects/[projectId]/assets/files — delete an asset file */
export async function DELETE(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { projectId } = await params;
  const hasAccess = await verifyProjectAccess(user.id, projectId, user.role, user.shipyardId);
  if (!hasAccess) return apiError("Forbidden", 403);
  if (!isWriteRole(user.role)) return apiError("Read-only role cannot modify this resource", 403);

  const { searchParams } = new URL(request.url);
  const fileId = searchParams.get("id");

  if (!fileId) {
    return apiError("File id is required", 400);
  }

  const fileIdNum = parseInt(fileId, 10);
  if (isNaN(fileIdNum)) {
    return apiError("Invalid file id", 400);
  }

  // Find file and verify it belongs to an asset in this project
  const assetFile = await prisma.assetFile.findUnique({
    where: { id: fileIdNum },
    include: {
      hardware: { select: { projectId: true } },
      software: { select: { projectId: true } },
    },
  });

  if (!assetFile) {
    return apiError("File not found", 404);
  }

  const fileProjectId =
    assetFile.hardware?.projectId ?? assetFile.software?.projectId;
  if (fileProjectId !== projectId) {
    return apiError("File does not belong to this project", 403);
  }

  // Delete file from disk
  try {
    const absolutePath = path.join(process.cwd(), assetFile.path);
    await unlink(absolutePath);
  } catch {
    // File may already be deleted from disk — continue with DB cleanup
  }

  await prisma.assetFile.delete({ where: { id: fileIdNum } });

  return NextResponse.json({ deleted: true });
}
