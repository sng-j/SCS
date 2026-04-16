import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, apiError } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

/** GET /api/admin/projects — list all projects with equipment for admin */
export async function GET() {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return apiError("Forbidden", 403);

  const projects = await prisma.project.findMany({
    include: {
      _count: {
        select: {
          equipments: { where: { deletedAt: null } },
          hardware: { where: { deletedAt: null } },
          software: { where: { deletedAt: null } },
        },
      },
      equipments: {
        where: { deletedAt: null },
        select: {
          id: true,
          name: true,
          status: true,
          vendor: { select: { name: true, company: true } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(projects);
}
