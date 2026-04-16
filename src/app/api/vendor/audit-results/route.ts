import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getSessionUser, apiError } from "@/lib/auth-helpers";
import { auditDir } from "@/lib/upload-dir";

export const dynamic = "force-dynamic";

const MAX_SIZE = 50 * 1024 * 1024; // 50MB

/** GET /api/vendor/audit-results?equipmentId=xxx — list audit results */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { searchParams } = new URL(request.url);
  const equipmentId = searchParams.get("equipmentId");

  const results = await prisma.vendorAuditResult.findMany({
    where: {
      vendorId: user.id,
      ...(equipmentId ? { equipmentId } : {}),
    },
    include: { equipment: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(
    results.map((r) => ({
      id: r.id,
      filename: r.filename,
      size: r.size,
      equipmentId: r.equipmentId,
      equipmentName: r.equipment.name,
      deviceName: r.deviceName,
      createdAt: r.createdAt,
    })),
  );
}

/** POST /api/vendor/audit-results — upload audit result file */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const equipmentId = formData.get("equipmentId") as string;
    const deviceName = formData.get("deviceName") as string | null;

    if (!file || typeof file === "string") return apiError("No file provided", 400);
    if (!equipmentId) return apiError("equipmentId is required", 400);
    if (file.size > MAX_SIZE) return apiError("File size exceeds 50MB limit", 400);

    // Validate file extension
    const ALLOWED_EXTENSIONS = new Set(["scsaudit", "scsdat", "json"]);
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return apiError("Only .scsaudit, .scsdat, .json files allowed", 400);
    }

    // Verify vendor owns this equipment
    const equipment = await prisma.equipment.findFirst({
      where: {
        id: equipmentId,
        vendors: { some: { id: user.id } },
      },
    });
    if (!equipment) return apiError("Equipment not found or access denied", 403);

    // Save file
    const uploadsDir = auditDir;
    await mkdir(uploadsDir, { recursive: true });

    const originalName = file.name;
    const uniqueName = `${crypto.randomUUID()}.${ext}`;
    const filePath = path.join(uploadsDir, uniqueName);

    const arrayBuffer = await file.arrayBuffer();
    await writeFile(filePath, Buffer.from(arrayBuffer));

    const record = await prisma.vendorAuditResult.create({
      data: {
        vendorId: user.id,
        equipmentId,
        deviceName: deviceName?.trim() || null,
        filename: originalName,
        filePath: `/api/upload/serve/${uniqueName}`,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
      },
    });

    return NextResponse.json(record, { status: 201 });
  } catch {
    return apiError("Failed to upload audit result", 500);
  }
}

/** DELETE /api/vendor/audit-results?id=xxx — delete audit result */
export async function DELETE(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return apiError("id is required", 400);

  const record = await prisma.vendorAuditResult.findUnique({ where: { id } });
  if (!record) return apiError("Not found", 404);
  if (record.vendorId !== user.id) return apiError("Forbidden", 403);

  await prisma.vendorAuditResult.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
