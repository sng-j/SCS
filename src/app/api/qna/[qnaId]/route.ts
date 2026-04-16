import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, apiError } from "@/lib/auth-helpers";
import { safeError } from "@/lib/safe-log";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ qnaId: string }>;
}

/** GET /api/qna/[qnaId] — get a single Q&A with files */
export async function GET(_request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { qnaId } = await params;

  const qna = await prisma.qna.findUnique({
    where: { id: qnaId },
    include: {
      user: { select: { id: true, name: true, email: true } },
      files: true,
    },
  });

  if (!qna) return apiError("Q&A not found", 404);

  // VENDOR can only see own Q&A
  if (user.role === "VENDOR" && qna.userId !== user.id) {
    return apiError("Forbidden", 403);
  }

  return NextResponse.json(qna);
}

/** PATCH /api/qna/[qnaId] — answer a Q&A (ADMIN/SHIPYARD only) */
export async function PATCH(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);
  if (user.role !== "ADMIN" && user.role !== "SHIPYARD") {
    return apiError("Forbidden", 403);
  }

  const { qnaId } = await params;

  try {
    // Verify Q&A exists before updating
    const existing = await prisma.qna.findUnique({ where: { id: qnaId } });
    if (!existing) return apiError("Q&A not found", 404);

    const body = await request.json();
    const { answer, status } = body;

    const qna = await prisma.qna.update({
      where: { id: qnaId },
      data: {
        ...(answer !== undefined && { answer: answer.trim() }),
        ...(status !== undefined && { status }),
        answeredBy: user.id,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        files: true,
      },
    });

    return NextResponse.json(qna);
  } catch (error) {
    safeError("Q&A PATCH error", error);
    return apiError("Failed to update Q&A", 500);
  }
}

/** DELETE /api/qna/[qnaId] — delete a Q&A (ADMIN only) */
export async function DELETE(_request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);
  if (user.role !== "ADMIN") {
    return apiError("Forbidden", 403);
  }

  const { qnaId } = await params;

  try {
    // Verify Q&A exists before deleting
    const existing = await prisma.qna.findUnique({ where: { id: qnaId } });
    if (!existing) return apiError("Q&A not found", 404);

    // Manual cascade: soft-delete attached files first.
    await prisma.qnaFile.deleteMany({ where: { qnaId } });
    await prisma.qna.delete({ where: { id: qnaId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    safeError("Q&A DELETE error", error);
    return apiError("Failed to delete Q&A", 500);
  }
}
