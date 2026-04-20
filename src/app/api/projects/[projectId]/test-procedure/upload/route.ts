import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, apiError } from "@/lib/auth-helpers";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { projectId } = await params;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const equipmentId = (formData.get("equipmentId") as string) || undefined;

  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  const uploadDir = path.join(process.cwd(), "uploads", "test-procedures", projectId);
  await mkdir(uploadDir, { recursive: true });

  const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const filePath = path.join(uploadDir, safeName);
  await writeFile(filePath, buffer);

  const relativePath = `/uploads/test-procedures/${projectId}/${safeName}`;

  // Upsert TestProcedure
  const tp = await prisma.testProcedure.findFirst({
    where: { projectId, equipmentId: equipmentId ?? null, deletedAt: null },
  });

  let result;
  if (tp) {
    result = await prisma.testProcedure.update({
      where: { id: tp.id },
      data: {
        status: "UPLOADED",
        uploadedFilePath: relativePath,
        uploadedFileName: safeName,
        uploadedOrigName: file.name,
        uploadedMimeType: file.type,
        uploadedSize: file.size,
      },
    });
  } else {
    result = await prisma.testProcedure.create({
      data: {
        projectId,
        equipmentId: equipmentId ?? null,
        status: "UPLOADED",
        uploadedFilePath: relativePath,
        uploadedFileName: safeName,
        uploadedOrigName: file.name,
        uploadedMimeType: file.type,
        uploadedSize: file.size,
      },
    });
  }

  return NextResponse.json(result);
}

// DELETE — 업로드 파일 제거 (MANUAL 상태로 되돌림)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { projectId } = await params;
  const equipmentId = req.nextUrl.searchParams.get("equipmentId") || undefined;

  const tp = await prisma.testProcedure.findFirst({
    where: { projectId, equipmentId: equipmentId ?? null, deletedAt: null },
  });

  if (!tp) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.testProcedure.update({
    where: { id: tp.id },
    data: {
      status: "MANUAL",
      uploadedFilePath: null,
      uploadedFileName: null,
      uploadedOrigName: null,
      uploadedMimeType: null,
      uploadedSize: null,
    },
  });

  return NextResponse.json({ ok: true });
}
