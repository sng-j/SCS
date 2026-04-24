import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, verifyProjectAccess, apiError, isWriteRole } from "@/lib/auth-helpers";
import { safeError } from "@/lib/safe-log";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ projectId: string }>;
}

/** GET /api/projects/[projectId]/submissions — list submissions with documents */
export async function GET(_request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { projectId } = await params;
  const hasAccess = await verifyProjectAccess(user.id, projectId, user.role, user.shipyardId);
  if (!hasAccess) return apiError("Forbidden", 403);

  const submissions = await prisma.submission.findMany({
    where: { projectId },
    include: {
      documents: { orderBy: { docType: "asc" } },
      files: true,
      _count: { select: { documents: true, files: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(submissions);
}

/** PATCH /api/projects/[projectId]/submissions — update submission status */
export async function PATCH(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { projectId } = await params;
  const hasAccess = await verifyProjectAccess(user.id, projectId, user.role, user.shipyardId);
  if (!hasAccess) return apiError("Forbidden", 403);
  if (!isWriteRole(user.role)) return apiError("Read-only role cannot modify this resource", 403);

  try {
    const body = await request.json();
    const { submissionId, status, reviewNote } = body;

    if (!submissionId) return apiError("submissionId is required", 400);

    const validStatuses = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "REVISION_REQUESTED", "APPROVED", "REJECTED"];
    if (status && !validStatuses.includes(status)) {
      return apiError("Invalid status", 400);
    }

    // Verify submission belongs to this project
    const existing = await prisma.submission.findFirst({
      where: { id: submissionId, projectId },
    });
    if (!existing) return apiError("Submission not found in this project", 404);

    // VENDOR can only transition to SUBMITTED (no reverting to DRAFT)
    if (user.role === "VENDOR") {
      if (status !== "SUBMITTED") {
        return apiError("Vendors can only submit", 403);
      }
      // Cannot re-submit if already beyond DRAFT
      if (["SUBMITTED", "UNDER_REVIEW", "APPROVED"].includes(existing.status)) {
        return apiError("Cannot modify already submitted submission", 403);
      }
    }

    const submission = await prisma.submission.update({
      where: { id: submissionId },
      data: {
        ...(status && { status }),
        ...(status === "SUBMITTED" && { submittedAt: new Date() }),
        ...(reviewNote !== undefined && { reviewNote }),
      },
      include: {
        documents: { orderBy: { docType: "asc" } },
        _count: { select: { documents: true, files: true } },
      },
    });

    return NextResponse.json(submission);
  } catch (error) {
    safeError("Submission PATCH error", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiError(`Failed to update submission: ${message}`, 500);
  }
}

/** POST /api/projects/[projectId]/submissions — create a new submission */
export async function POST(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { projectId } = await params;
  const hasAccess = await verifyProjectAccess(user.id, projectId, user.role, user.shipyardId);
  if (!hasAccess) return apiError("Forbidden", 403);
  if (!isWriteRole(user.role)) return apiError("Read-only role cannot modify this resource", 403);

  try {
    const body = await request.json();
    const { phase } = body;

    const validPhases = ["INVENTORY", "ASSESS", "DOCUMENT", "SUBMIT"];
    if (phase && !validPhases.includes(phase)) {
      return apiError("Invalid phase", 400);
    }

    // Reuse existing DRAFT submission instead of creating duplicates
    const existingDraft = await prisma.submission.findFirst({
      where: { projectId, status: "DRAFT" },
      include: { documents: true },
    });
    if (existingDraft) {
      return NextResponse.json(existingDraft);
    }

    const submission = await prisma.submission.create({
      data: {
        projectId,
        phase: phase || "DOCUMENT",
        status: "DRAFT",
      },
      include: { documents: true },
    });

    return NextResponse.json(submission, { status: 201 });
  } catch (error) {
    safeError("Submission POST error", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiError(`Failed to create submission: ${message}`, 500);
  }
}
