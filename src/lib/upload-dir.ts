import path from "path";

/**
 * Base upload directory — configurable via UPLOAD_DIR env var.
 * Defaults to `<project-root>/uploads`.
 *
 * When migrating to cloud storage (e.g. Naver Object Storage),
 * replace this module with an SDK-based implementation.
 */
const BASE = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");

/** uploads/secure — general authenticated file uploads */
export const secureDir = path.join(BASE, "secure");

/** uploads/audit — vendor audit result files */
export const auditDir = path.join(BASE, "audit");

/** uploads/asset-files — project asset files */
export const assetFilesDir = path.join(BASE, "asset-files");

/** uploads/cert-docs — equipment certification documents */
export const certDocsDir = path.join(BASE, "cert-docs");

/** uploads/dfd-images — DFD diagram image exports */
export const dfdImagesDir = path.join(BASE, "dfd-images");

/** Legacy public/uploads (read-only fallback for old files) */
export const legacyDir = path.join(process.cwd(), "public", "uploads");
