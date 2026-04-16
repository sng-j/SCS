import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { getSessionUser, apiError } from "@/lib/auth-helpers";
import { secureDir } from "@/lib/upload-dir";

export const dynamic = "force-dynamic";

const ALLOWED_EXTENSIONS = new Set(["pdf", "docx", "xlsx", "png", "jpg", "jpeg"]);
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

/** POST /api/upload — upload a file (authenticated users only) */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file || typeof file === "string") {
      return apiError("No file provided", 400);
    }

    // Validate file size
    if (file.size > MAX_SIZE) {
      return apiError("File size exceeds 10MB limit", 400);
    }

    // Validate file extension
    const originalName = file.name;
    const ext = originalName.split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return apiError(
        `File type not allowed. Allowed types: ${[...ALLOWED_EXTENSIONS].join(", ")}`,
        400,
      );
    }

    // Validate MIME type server-side
    const ALLOWED_MIMES = new Set([
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "image/png", "image/jpeg",
    ]);
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

    return NextResponse.json(
      {
        filename: uniqueName,
        path: `/api/upload/serve/${uniqueName}`,
        mimeType: file.type,
        size: file.size,
      },
      { status: 201 },
    );
  } catch {
    return apiError("Failed to upload file", 500);
  }
}
