import { NextResponse } from "next/server";
import { getSessionUser, apiError } from "@/lib/auth-helpers";
import fs from "fs";
import path from "path";
import { secureDir, legacyDir } from "@/lib/upload-dir";

export const dynamic = "force-dynamic";

// Check both legacy (public/uploads) and secure directories
const SECURE_UPLOADS_DIR = secureDir;
const LEGACY_UPLOADS_DIR = legacyDir;

/** GET /api/admin/files — list all uploaded files */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);
  if (user.role !== "ADMIN") return apiError("Forbidden", 403);

  try {
    const allFiles: { filename: string; size: number; type: string; createdAt: string; modifiedAt: string; location: string }[] = [];

    for (const dir of [SECURE_UPLOADS_DIR, LEGACY_UPLOADS_DIR]) {
      if (!fs.existsSync(dir)) continue;
      const entries = fs.readdirSync(dir);
      for (const name of entries) {
        const fullPath = path.join(dir, name);
        if (!fs.statSync(fullPath).isFile()) continue;
        const stat = fs.statSync(fullPath);
        const ext = path.extname(name).toLowerCase();
        allFiles.push({
          filename: name,
          size: stat.size,
          type: ext || "unknown",
          createdAt: stat.birthtime.toISOString(),
          modifiedAt: stat.mtime.toISOString(),
          location: dir === SECURE_UPLOADS_DIR ? "secure" : "legacy",
        });
      }
    }

    allFiles.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return NextResponse.json({ files: allFiles });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to list files";
    return apiError(message, 500);
  }
}

/** DELETE /api/admin/files?filename= — delete a specific file */
export async function DELETE(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);
  if (user.role !== "ADMIN") return apiError("Forbidden", 403);

  const { searchParams } = new URL(request.url);
  const filename = searchParams.get("filename");

  if (!filename) {
    return apiError("filename is required", 400);
  }

  // Prevent path traversal
  const safeName = path.basename(filename);
  if (safeName !== filename || filename.includes("..")) {
    return apiError("Invalid filename", 400);
  }

  // Search both directories
  let filePath = path.join(SECURE_UPLOADS_DIR, safeName);
  if (!fs.existsSync(filePath)) {
    filePath = path.join(LEGACY_UPLOADS_DIR, safeName);
  }

  try {
    if (!fs.existsSync(filePath)) {
      return apiError("File not found", 404);
    }

    fs.unlinkSync(filePath);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete file";
    return apiError(message, 500);
  }
}
