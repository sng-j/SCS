import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, verifyProjectAccess, apiError } from "@/lib/auth-helpers";
import { generateDocx, ALL_DOC_TYPES } from "@/lib/docx";

export const dynamic = "force-dynamic";

const E26_DOC_TYPES = Object.keys(ALL_DOC_TYPES).filter((k) => k.startsWith("E26"));

/** GET /api/projects/[projectId]/e26 — Check E26 readiness & document status */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);
  const { projectId } = await params;

  const hasAccess = await verifyProjectAccess(user.id, projectId, user.role, user.shipyardId);
  if (!hasAccess) return apiError("Forbidden", 403);

  // Get all equipment for this vessel (project)
  const equipments = await prisma.equipment.findMany({
    where: { projectId },
    select: { id: true, name: true, status: true, vendor: { select: { name: true, company: true } } },
  });

  const total = equipments.length;
  const approved = equipments.filter((e) => e.status === "APPROVED").length;
  const allApproved = total > 0 && approved === total;

  // Check existing E26 documents
  const existingDocs = await prisma.document.findMany({
    where: {
      submission: { projectId },
      docType: { in: E26_DOC_TYPES },
    },
    select: { id: true, docType: true, version: true, status: true, createdAt: true },
  });

  return NextResponse.json({
    ready: allApproved,
    equipmentStatus: { total, approved, pending: total - approved },
    equipments: equipments.map((e) => ({
      id: e.id, name: e.name, status: e.status,
      vendor: e.vendor?.company || e.vendor?.name || "—",
    })),
    documents: existingDocs,
    docTypes: E26_DOC_TYPES.map((k) => ({ key: k, title: ALL_DOC_TYPES[k] })),
  });
}

/** POST /api/projects/[projectId]/e26 — Generate E26 documents for the vessel */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);
  // E26 generation is a write action — only SUPPORT or ADMIN
  if (user.role !== "SUPPORT" && user.role !== "ADMIN") return apiError("Forbidden", 403);
  const { projectId } = await params;

  const hasAccess = await verifyProjectAccess(user.id, projectId, user.role, user.shipyardId);
  if (!hasAccess) return apiError("Forbidden", 403);

  // Verify all equipment is approved
  const equipments = await prisma.equipment.findMany({
    where: { projectId },
    select: { id: true, status: true },
  });
  const allApproved = equipments.length > 0 && equipments.every((e) => e.status === "APPROVED");
  if (!allApproved) {
    return apiError("All equipment must be approved before generating E26 documents", 400);
  }

  // Find or create a project-level submission for E26 docs
  let submission = await prisma.submission.findFirst({
    where: { projectId, phase: "E26" },
  });
  if (!submission) {
    submission = await prisma.submission.create({
      data: { projectId, status: "DRAFT", phase: "E26" },
    });
  }

  // Generate each E26 document
  const results: { docType: string; title: string; success: boolean; error?: string }[] = [];

  for (const docType of E26_DOC_TYPES) {
    try {
      const buffer = await generateDocx(projectId, docType);
      const contentBase64 = buffer.toString("base64");

      // Upsert document record
      const existing = await prisma.document.findFirst({
        where: { submissionId: submission.id, docType },
      });

      if (existing) {
        await prisma.document.update({
          where: { id: existing.id },
          data: {
            content: contentBase64,
            version: existing.version + 1,
            status: "GENERATED",
            generatedAt: new Date(),
          },
        });
      } else {
        await prisma.document.create({
          data: {
            submissionId: submission.id,
            docType,
            title: ALL_DOC_TYPES[docType],
            content: contentBase64,
            version: 1,
            status: "GENERATED",
            generatedAt: new Date(),
          },
        });
      }

      results.push({ docType, title: ALL_DOC_TYPES[docType], success: true });
    } catch (err) {
      results.push({
        docType,
        title: ALL_DOC_TYPES[docType],
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return NextResponse.json({
    generated: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
  });
}
