// ─── AI Feedback API (👍/👎) ─────────────────────────────────────────────────
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, apiError } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

/** POST /api/ai/feedback — save thumbs up/down */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  try {
    const { conversationId, rating } = await request.json();

    if (!conversationId || (rating !== 1 && rating !== -1)) {
      return apiError("conversationId and rating (1 or -1) required", 400);
    }

    const feedback = await prisma.aiFeedback.upsert({
      where: { conversationId_userId: { conversationId, userId: user.id } },
      update: { rating },
      create: { conversationId, userId: user.id, rating },
    });

    return NextResponse.json({ id: feedback.id, rating: feedback.rating });
  } catch {
    return apiError("Failed to save feedback", 500);
  }
}
