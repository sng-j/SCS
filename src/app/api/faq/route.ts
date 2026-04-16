import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, apiError } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

/** GET /api/faq — list all active FAQs ordered by sortOrder (authenticated) */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const faqs = await prisma.faq.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json(faqs);
}

/** POST /api/faq — create a new FAQ (ADMIN only) */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);
  if (user.role !== "ADMIN") return apiError("Forbidden", 403);

  try {
    const body = await request.json();
    const { category, question, answer, sortOrder } = body;

    if (!category || !question || !answer) {
      return apiError("category, question, and answer are required", 400);
    }

    const faq = await prisma.faq.create({
      data: {
        category: category.trim(),
        question: question.trim(),
        answer: answer.trim(),
        sortOrder: sortOrder ?? 0,
      },
    });

    return NextResponse.json(faq, { status: 201 });
  } catch {
    return apiError("Failed to create FAQ", 500);
  }
}

/** PATCH /api/faq — update an existing FAQ (ADMIN only) */
export async function PATCH(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);
  if (user.role !== "ADMIN") return apiError("Forbidden", 403);

  try {
    const body = await request.json();
    const { id, question, answer, category, sortOrder, isActive } = body;

    if (!id) return apiError("id is required", 400);

    const faq = await prisma.faq.update({
      where: { id },
      data: {
        ...(question !== undefined && { question: question.trim() }),
        ...(answer !== undefined && { answer: answer.trim() }),
        ...(category !== undefined && { category: category.trim() }),
        ...(sortOrder !== undefined && { sortOrder }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    return NextResponse.json(faq);
  } catch {
    return apiError("Failed to update FAQ", 500);
  }
}

/** DELETE /api/faq — delete a FAQ (ADMIN only) */
export async function DELETE(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);
  if (user.role !== "ADMIN") return apiError("Forbidden", 403);

  try {
    const body = await request.json();
    const { id } = body;

    if (!id) return apiError("id is required", 400);

    await prisma.faq.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch {
    return apiError("Failed to delete FAQ", 500);
  }
}
