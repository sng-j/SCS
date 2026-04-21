import { NextResponse } from "next/server";
import { writeFileSync, mkdirSync, existsSync, unlinkSync } from "fs";
import path from "path";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getSessionUser, verifyProjectAccess, apiError, isWriteRole } from "@/lib/auth-helpers";
import { certDocsDir } from "@/lib/upload-dir";

export const dynamic = "force-dynamic";

const UPLOAD_DIR = certDocsDir;

/** Verify equipment belongs to project and user has access */
async function verifyEquipmentAccess(
  userId: string,
  role: string,
  projectId: string,
  equipmentId: string,
  shipyardId: string | null,
) {
  const hasAccess = await verifyProjectAccess(userId, projectId, role, shipyardId);
  if (!hasAccess) return { error: "Forbidden", status: 403 };

  const equipment = await prisma.equipment.findFirst({
    where: { id: equipmentId, projectId },
  });
  if (!equipment) return { error: "Equipment not found in this project", status: 404 };

  // VENDOR can only access their own equipment
  if (role === "VENDOR" && equipment.vendorId !== userId) {
    return { error: "Forbidden", status: 403 };
  }

  return null;
}

/** GET — list cert documents for equipment */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string; equipmentId: string }> }
) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { projectId, equipmentId } = await params;

  const accessErr = await verifyEquipmentAccess(user.id, user.role, projectId, equipmentId, user.shipyardId);
  if (accessErr) return apiError(accessErr.error, accessErr.status);

  const docs = await prisma.certDocument.findMany({
    where: { equipmentId },
    orderBy: { createdAt: "desc" },
    include: { uploader: { select: { name: true } } },
  });

  return NextResponse.json(docs);
}

/** POST — upload cert document */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string; equipmentId: string }> }
) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { projectId, equipmentId } = await params;

  const accessErr = await verifyEquipmentAccess(user.id, user.role, projectId, equipmentId, user.shipyardId);
  if (accessErr) return apiError(accessErr.error, accessErr.status);

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const docType = (formData.get("docType") as string) || "OTHER";
  const note = (formData.get("note") as string) || null;

  if (!file) return apiError("No file uploaded", 400);

  // Validate file type
  const allowed = ["application/pdf", "image/png", "image/jpeg", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
  if (!allowed.includes(file.type)) {
    return apiError("Only PDF, PNG, JPG, DOCX files are allowed", 400);
  }

  // Save file
  if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });

  const ext = file.name.split(".").pop() || "pdf";
  const filename = `${crypto.randomUUID()}.${ext}`;
  const filePath = path.join(UPLOAD_DIR, filename);
  const buffer = Buffer.from(await file.arrayBuffer());
  writeFileSync(filePath, buffer);

  const doc = await prisma.certDocument.create({
    data: {
      equipmentId,
      docType,
      filename,
      originalName: file.name,
      mimeType: file.type,
      size: buffer.length,
      uploadedBy: user.id,
      note,
    },
  });

  return NextResponse.json(doc, { status: 201 });
}

/** DELETE — remove cert document */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ projectId: string; equipmentId: string }> }
) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { projectId, equipmentId } = await params;

  const accessErr = await verifyEquipmentAccess(user.id, user.role, projectId, equipmentId, user.shipyardId);
  if (accessErr) return apiError(accessErr.error, accessErr.status);
  const { id } = await request.json();
  if (!id) return apiError("Document ID required", 400);

  const doc = await prisma.certDocument.findFirst({
    where: { id, equipmentId },
  });
  if (!doc) return apiError("Document not found", 404);

  // Delete file
  try { unlinkSync(path.join(UPLOAD_DIR, doc.filename)); } catch {}

  await prisma.certDocument.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
