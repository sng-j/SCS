import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, apiError } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

interface ShipyardRow {
  name: string;
  address?: string;
  phone?: string;
  contact?: string;
}

/**
 * POST /api/admin/shipyards/bulk
 * Body: { shipyards: ShipyardRow[] }
 * Creates multiple shipyards at once. Skips duplicates by name.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return apiError("Forbidden", 403);

  const body = await req.json();
  const rows: ShipyardRow[] = Array.isArray(body.shipyards) ? body.shipyards : [];
  if (rows.length === 0) return apiError("No shipyard rows provided", 400);

  const existing = await prisma.shipyard.findMany({ select: { name: true } });
  const existingNames = new Set(existing.map((s) => s.name.trim().toLowerCase()));

  let created = 0;
  const errors: { row: number; name: string; error: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const name = (r.name || "").trim();
    if (!name) {
      errors.push({ row: i + 1, name: "", error: "name is required" });
      continue;
    }
    if (existingNames.has(name.toLowerCase())) {
      errors.push({ row: i + 1, name, error: "already exists" });
      continue;
    }
    try {
      await prisma.shipyard.create({
        data: {
          name,
          address: r.address?.trim() || null,
          phone: r.phone?.trim() || null,
          contact: r.contact?.trim() || null,
        },
      });
      existingNames.add(name.toLowerCase());
      created++;
    } catch (err) {
      errors.push({ row: i + 1, name, error: err instanceof Error ? err.message : "creation failed" });
    }
  }

  return NextResponse.json({ created, errors, total: rows.length });
}
