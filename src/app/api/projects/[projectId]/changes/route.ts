import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, verifyProjectAccess, apiError } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ projectId: string }>;
}

/** GET /api/projects/[projectId]/changes — list change events for a project */
export async function GET(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { projectId } = await params;
  const hasAccess = await verifyProjectAccess(user.id, projectId, user.role, user.shipyardId);
  if (!hasAccess) return apiError("Forbidden", 403);

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)));
  const skip = (page - 1) * limit;

  // filter: "unresolved" | "resolved" | "all" (default: unresolved)
  const filter = searchParams.get("filter") || "unresolved";
  const where: { projectId: string; resolvedAt?: null | { not: null } } = { projectId };
  if (filter === "unresolved") where.resolvedAt = null;
  else if (filter === "resolved") where.resolvedAt = { not: null };

  const [changes, total, unresolvedCount] = await Promise.all([
    prisma.changeEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.changeEvent.count({ where }),
    prisma.changeEvent.count({ where: { projectId, resolvedAt: null } }),
  ]);

  return NextResponse.json({
    changes,
    unresolvedCount,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}

/** PATCH /api/projects/[projectId]/changes?id=XXX — resolve or reopen a change event */
export async function PATCH(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { projectId } = await params;
  const hasAccess = await verifyProjectAccess(user.id, projectId, user.role, user.shipyardId);
  if (!hasAccess) return apiError("Forbidden", 403);

  // Only SHIPYARD and ADMIN can resolve
  if (user.role !== "SHIPYARD" && user.role !== "ADMIN") {
    return apiError("Only shipyard or admin can resolve change events", 403);
  }

  const { searchParams } = new URL(request.url);
  const changeId = searchParams.get("id");
  if (!changeId) return apiError("id query param is required", 400);

  const body = await request.json().catch(() => ({}));
  const { action, resolutionNote } = body as { action?: "resolve" | "reopen"; resolutionNote?: string };

  // Verify the change belongs to this project
  const existing = await prisma.changeEvent.findUnique({ where: { id: changeId } });
  if (!existing || existing.projectId !== projectId) return apiError("Change event not found", 404);

  const updated = await prisma.changeEvent.update({
    where: { id: changeId },
    data: action === "reopen"
      ? { resolvedAt: null, resolvedBy: null, resolutionNote: null }
      : {
          resolvedAt: new Date(),
          resolvedBy: user.email || user.id,
          resolutionNote: resolutionNote || null,
        },
  });

  return NextResponse.json(updated);
}
