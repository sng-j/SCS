import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, verifyProjectAccess, apiError } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ projectId: string }>;
}

// ─── POST: Save feedback (thumbs up/down) ───────────────────────────────────

export async function POST(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { projectId } = await params;
  const hasAccess = await verifyProjectAccess(user.id, projectId, user.role, user.shipyardId);
  if (!hasAccess) return apiError("Forbidden", 403);

  let body: { conversationId?: string; rating?: number };
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  const { conversationId, rating } = body;

  if (!conversationId || typeof conversationId !== "string") {
    return apiError("conversationId is required", 400);
  }

  if (rating !== 1 && rating !== -1) {
    return apiError("rating must be 1 or -1", 400);
  }

  // Verify the conversation exists and belongs to this project
  const conversation = await prisma.aiConversation.findFirst({
    where: {
      id: conversationId,
      projectId,
    },
  });

  if (!conversation) {
    return apiError("Conversation not found", 404);
  }

  // Upsert feedback (unique constraint on [conversationId, userId])
  const feedback = await prisma.aiFeedback.upsert({
    where: {
      conversationId_userId: {
        conversationId,
        userId: user.id,
      },
    },
    update: {
      rating,
    },
    create: {
      conversationId,
      userId: user.id,
      rating,
    },
  });

  return NextResponse.json({
    id: feedback.id,
    conversationId: feedback.conversationId,
    rating: feedback.rating,
    createdAt: feedback.createdAt,
  });
}

// ─── GET: Get feedback for conversations ────────────────────────────────────

export async function GET(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { projectId } = await params;
  const hasAccess = await verifyProjectAccess(user.id, projectId, user.role, user.shipyardId);
  if (!hasAccess) return apiError("Forbidden", 403);

  const url = new URL(request.url);
  const conversationId = url.searchParams.get("conversationId");

  const where: { userId: string; conversationId?: string } = {
    userId: user.id,
  };

  if (conversationId) {
    where.conversationId = conversationId;
  }

  const feedbacks = await prisma.aiFeedback.findMany({
    where,
    select: {
      id: true,
      conversationId: true,
      rating: true,
      createdAt: true,
    },
  });

  return NextResponse.json(feedbacks);
}
