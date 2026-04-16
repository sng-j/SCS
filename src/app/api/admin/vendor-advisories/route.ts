import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, apiError } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

/** GET /api/admin/vendor-advisories — list advisories with pagination */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);
  if (user.role !== "ADMIN") return apiError("Forbidden", 403);

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
  const vendor = searchParams.get("vendor")?.trim() || "";
  const skip = (page - 1) * limit;

  const where = vendor ? { vendor: { contains: vendor } } : {};

  const [advisories, total] = await Promise.all([
    prisma.vendorAdvisory.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.vendorAdvisory.count({ where }),
  ]);

  return NextResponse.json({
    advisories,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}

/** POST /api/admin/vendor-advisories — create advisory */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);
  if (user.role !== "ADMIN") return apiError("Forbidden", 403);

  const body = await request.json();
  const { vendor, product, title, description, url, severity, publishedAt } = body as {
    vendor: string;
    product?: string;
    title: string;
    description: string;
    url?: string;
    severity?: string;
    publishedAt?: string;
  };

  if (!vendor || !title || !description) {
    return apiError("vendor, title, and description are required", 400);
  }

  const advisory = await prisma.vendorAdvisory.create({
    data: {
      vendor,
      product: product || null,
      title,
      description,
      url: url || null,
      severity: severity || null,
      publishedAt: publishedAt ? new Date(publishedAt) : null,
    },
  });

  return NextResponse.json(advisory, { status: 201 });
}

/** DELETE /api/admin/vendor-advisories?id= — delete advisory */
export async function DELETE(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);
  if (user.role !== "ADMIN") return apiError("Forbidden", 403);

  const { searchParams } = new URL(request.url);
  const id = parseInt(searchParams.get("id") ?? "0", 10);

  if (!id) {
    return apiError("id is required", 400);
  }

  try {
    await prisma.vendorAdvisory.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return apiError("Advisory not found", 404);
  }
}
