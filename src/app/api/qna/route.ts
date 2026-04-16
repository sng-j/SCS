import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, apiError } from "@/lib/auth-helpers";
import { safeError } from "@/lib/safe-log";

export const dynamic = "force-dynamic";

/**
 * GET /api/qna — list Q&As by role:
 *   ADMIN    → all Q&As with targetType "TO_ADMIN"
 *   SHIPYARD → own Q&As + all vendor Q&As with targetType "TO_SHIPYARD"
 *   VENDOR   → own Q&As only
 */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { searchParams } = new URL(request.url);
  const all = searchParams.get("all");

  let where = {};
  if (user.role === "ADMIN") {
    where = {}; // Admin sees ALL
  } else if (user.role === "SHIPYARD") {
    // Shipyard sees: questions directed to them (TO_SHIPYARD) + own questions + all questions 
    // from their shipyard's vendors. Filtered by shipyardId for isolation.
    where = {
      user: { shipyardId: user.shipyardId },
      OR: [
        { targetType: "TO_SHIPYARD" },
        { targetType: "TO_ADMIN" },
        { userId: user.id }
      ]
    };
  } else {
    // Vendor sees own questions only
    where = { userId: user.id };
  }

  const qnas = await prisma.qna.findMany({
    where,
    include: {
      user: { select: { id: true, name: true, email: true, role: true, company: true } },
      files: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(qnas);
}

/** POST /api/qna — create a new Q&A */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  try {
    const body = await request.json();
    const { title, content, projectId, targetType } = body;

    if (!title || !content) {
      return apiError("title and content are required", 400);
    }

    const resolvedTarget = targetType || "TO_ADMIN";

    const qna = await prisma.qna.create({
      data: {
        userId: user.id,
        title: title.trim(),
        content: content.trim(),
        ...(projectId ? { projectId } : {}),
        targetType: resolvedTarget,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        files: true,
      },
    });

    return NextResponse.json(qna, { status: 201 });
  } catch (err) {
    safeError("QNA POST", err);
    return apiError("Failed to create Q&A", 500);
  }
}
