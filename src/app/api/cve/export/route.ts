import { prisma } from "@/lib/prisma";
import { getSessionUser, apiError } from "@/lib/auth-helpers";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * GET /api/cve/export — export CVE search results as CSV
 *
 * Query params: keyword, vendor, product, severity (same as search)
 */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get("keyword")?.trim() || "";
  const vendor = searchParams.get("vendor")?.trim() || "";
  const product = searchParams.get("product")?.trim() || "";
  const severity = searchParams.get("severity")?.trim().toUpperCase() || "";

  // Build where clause (same logic as search route)
  const where: Prisma.CveLocalWhereInput = {};
  const andConditions: Prisma.CveLocalWhereInput[] = [];

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
    // Limit export to 5000 rows for performance
    const results = await prisma.cveLocal.findMany({
      where,
      select: {
        cveId: true,
        description: true,
        baseScore: true,
        baseSeverity: true,
        vendor: true,
        product: true,
        publishedAt: true,
      },
      orderBy: [
        { baseScore: "desc" },
        { publishedAt: "desc" },
      ],
      take: 5000,
    });

    // Build CSV
    const header = "CVE ID,Description,Score,Severity,Vendor,Product,Published Date";
    const rows = results.map((cve) => {
      const desc = (cve.description || "").replace(/"/g, '""').replace(/\n/g, " ");
      return [
        cve.cveId,
        `"${desc}"`,
        cve.baseScore != null ? cve.baseScore.toFixed(1) : "",
        cve.baseSeverity || "",
        cve.vendor || "",
        cve.product || "",
        cve.publishedAt ? new Date(cve.publishedAt).toISOString().split("T")[0] : "",
      ].join(",");
    });

    const csv = [header, ...rows].join("\n");

    // Add BOM for Excel compatibility
    const bom = "\uFEFF";
    const csvWithBom = bom + csv;

    return new Response(csvWithBom, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="cve-export-${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Export failed";
    return apiError(message, 500);
  }
}
