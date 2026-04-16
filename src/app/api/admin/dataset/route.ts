import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, apiError } from "@/lib/auth-helpers";
import { safeError } from "@/lib/safe-log";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/dataset — Export training dataset
 * ?type=conversations|feedback|actions|nlp|all
 * &format=json|ndjson
 * &from=2026-01-01&to=2026-12-31
 */
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return apiError("Admin required", 403);

  const sp = request.nextUrl.searchParams;
  const type = sp.get("type") || "all";
  const format = sp.get("format") || "json";
  const from = sp.get("from") ? new Date(sp.get("from")!) : undefined;
  const to = sp.get("to") ? new Date(sp.get("to")!) : undefined;

  const dateFilter = from || to ? {
    createdAt: {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: to } : {}),
    },
  } : {};

  try {
    const dataset: Record<string, unknown> = {};

    // AI Conversations (chat messages)
    if (type === "conversations" || type === "all") {
      const conversations = await prisma.aiConversation.findMany({
        where: dateFilter,
        orderBy: { createdAt: "desc" },
        select: {
          id: true, role: true, content: true, intent: true,
          confidence: true, projectId: true, createdAt: true,
          user: { select: { role: true } },
        },
      });
      dataset.conversations = conversations.map((c) => ({
        id: c.id,
        role: c.role,
        content: c.content,
        intent: c.intent,
        confidence: c.confidence,
        projectId: c.projectId,
        userRole: c.user.role,
        createdAt: c.createdAt,
      }));
    }

    // AI Feedback (thumbs up/down)
    if (type === "feedback" || type === "all") {
      const feedback = await prisma.aiFeedback.findMany({
        where: dateFilter,
        orderBy: { createdAt: "desc" },
        select: {
          conversationId: true, rating: true, createdAt: true,
          user: { select: { role: true } },
        },
      });
      dataset.feedback = feedback.map((f) => ({
        conversationId: f.conversationId,
        rating: f.rating,
        userRole: f.user.role,
        createdAt: f.createdAt,
      }));
    }

    // User Action Logs
    if (type === "actions" || type === "all") {
      const actions = await prisma.userActionLog.findMany({
        where: dateFilter,
        orderBy: { createdAt: "desc" },
        select: {
          action: true, entity: true, entityId: true,
          projectId: true, data: true, createdAt: true,
          user: { select: { role: true } },
        },
      });
      dataset.actions = actions.map((a) => ({
        action: a.action,
        entity: a.entity,
        entityId: a.entityId,
        projectId: a.projectId,
        data: a.data ? JSON.parse(a.data) : null,
        userRole: a.user.role,
        createdAt: a.createdAt,
      }));
    }

    // NLP Intent Logs
    if (type === "nlp" || type === "all") {
      const nlp = await prisma.aiNlpLog.findMany({
        where: dateFilter,
        orderBy: { createdAt: "desc" },
        select: {
          input: true, intent: true, confidence: true,
          latencyMs: true, createdAt: true,
        },
      });
      dataset.nlp = nlp;
    }

    // Summary stats
    if (type === "all") {
      dataset.summary = {
        conversations: (dataset.conversations as unknown[])?.length || 0,
        feedback: (dataset.feedback as unknown[])?.length || 0,
        actions: (dataset.actions as unknown[])?.length || 0,
        nlp: (dataset.nlp as unknown[])?.length || 0,
        exportedAt: new Date().toISOString(),
      };
    }

    // NDJSON format
    if (format === "ndjson") {
      const lines: string[] = [];
      for (const [key, items] of Object.entries(dataset)) {
        if (Array.isArray(items)) {
          for (const item of items) {
            lines.push(JSON.stringify({ type: key, ...item }));
          }
        }
      }
      return new NextResponse(lines.join("\n"), {
        headers: {
          "Content-Type": "application/x-ndjson",
          "Content-Disposition": `attachment; filename="scs-dataset-${new Date().toISOString().slice(0, 10)}.ndjson"`,
        },
      });
    }

    return NextResponse.json(dataset);
  } catch (error) {
    safeError("Dataset export error", error);
    return apiError("Failed to export dataset", 500);
  }
}

/** GET /api/admin/dataset?type=stats — Quick stats only */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return apiError("Admin required", 403);

  try {
    const [conversations, feedback, actions, nlp] = await Promise.all([
      prisma.aiConversation.count(),
      prisma.aiFeedback.count(),
      prisma.userActionLog.count(),
      prisma.aiNlpLog.count(),
    ]);

    return NextResponse.json({
      conversations,
      feedback,
      actions,
      nlp,
      total: conversations + feedback + actions + nlp,
    });
  } catch {
    return apiError("Failed to get stats", 500);
  }
}
