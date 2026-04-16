import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, apiError } from "@/lib/auth-helpers";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * GET /api/cve/search — Search local CVE database
 *
 * Query params:
 *   keyword  - full-text search on description
 *   cveId    - exact CVE ID match (e.g., CVE-2024-1234)
 *   vendor   - filter by vendor (case-insensitive contains)
 *   product  - filter by product (case-insensitive contains)
 *   severity - filter by baseSeverity (CRITICAL, HIGH, MEDIUM, LOW)
 *   page     - pagination page (default 1)
 *   limit    - results per page (default 20, max 100)
 */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get("keyword")?.trim() || "";
  const cveId = searchParams.get("cveId")?.trim() || "";
  const vendor = searchParams.get("vendor")?.trim() || "";
  const product = searchParams.get("product")?.trim() || "";
  const severity = searchParams.get("severity")?.trim().toUpperCase() || "";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
  const skip = (page - 1) * limit;

  // Check cache first for the exact query combination
  const cacheKey = `search:${keyword}:${cveId}:${vendor}:${product}:${severity}:${page}:${limit}`;
  const cached = await prisma.cveCache.findUnique({
    where: { query: cacheKey },
  });

  if (cached && cached.expiresAt > new Date()) {
    const cachedResult = typeof cached.result === 'string' ? JSON.parse(cached.result) : cached.result;
    return NextResponse.json(cachedResult);
  }

  // Build where clause
  const where: Prisma.CveLocalWhereInput = {};
  const andConditions: Prisma.CveLocalWhereInput[] = [];

  if (cveId) {
    andConditions.push({ cveId: { contains: cveId } });
  }

  if (vendor) {
    andConditions.push({ vendor: { contains: vendor } });
  }

  if (product) {
    andConditions.push({ product: { contains: product } });
  }

  if (severity) {
    const validSeverities = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
    if (validSeverities.includes(severity)) {
      andConditions.push({ baseSeverity: severity });
    }
  }

  if (keyword) {
    andConditions.push({
      description: { contains: keyword },
    });
  }

  if (andConditions.length > 0) {
    where.AND = andConditions;
  }

  try {
    const [results, total] = await Promise.all([
      prisma.cveLocal.findMany({
        where,
        select: {
          id: true,
          cveId: true,
          description: true,
          baseScore: true,
          baseSeverity: true,
          vendor: true,
          product: true,
          versionStart: true,
          versionEnd: true,
          publishedAt: true,
          modifiedAt: true,
        },
        orderBy: [
          { baseScore: "desc" },
          { publishedAt: "desc" },
        ],
        skip,
        take: limit,
      }),
      prisma.cveLocal.count({ where }),
    ]);

    const response = {
      results,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };

    // Cache for 10 minutes
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await prisma.cveCache.upsert({
      where: { query: cacheKey },
      update: { result: JSON.stringify(response), expiresAt },
      create: { query: cacheKey, result: JSON.stringify(response), expiresAt },
    }).catch(() => {
      // Cache write failures are non-critical
    });

    return NextResponse.json(response);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Search failed";
    return apiError(message, 500);
  }
}
