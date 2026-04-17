import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, apiError } from "@/lib/auth-helpers";
import { validatePassword } from "@/lib/password-policy";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

interface CsvRow {
  email: string;
  name: string;
  company?: string;
  phone?: string;
  password: string;
}

/**
 * POST /api/shipyard/vendors/bulk — create multiple vendor accounts from CSV data.
 *
 * Body: { vendors: CsvRow[] }
 *
 * Returns: { created: number, errors: { row: number, email: string, error: string }[] }
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);
  // Write (bulk create): only SUPPORT or ADMIN. SHIPYARD is now read-only.
  if (user.role !== "SUPPORT" && user.role !== "ADMIN") return apiError("Forbidden", 403);

  const shipyardId = user.shipyardId;
  if (!shipyardId && user.role === "SUPPORT") return apiError("Shipyard not assigned", 400);

  const body = await req.json();
  const vendors: CsvRow[] = body.vendors;
  if (!Array.isArray(vendors) || vendors.length === 0) {
    return apiError("vendors array is required", 400);
  }
  if (vendors.length > 100) {
    return apiError("Maximum 100 vendors per batch", 400);
  }

  // Pre-check all emails for uniqueness
  const emails = vendors.map((v) => v.email?.trim().toLowerCase()).filter(Boolean);
  const existing = await prisma.user.findMany({
    where: { email: { in: emails } },
    select: { email: true },
  });
  const existingSet = new Set(existing.map((e) => e.email.toLowerCase()));

  const created: string[] = [];
  const errors: { row: number; email: string; error: string }[] = [];

  for (let i = 0; i < vendors.length; i++) {
    const v = vendors[i];
    const email = v.email?.trim().toLowerCase();
    const name = v.name?.trim();
    const password = v.password?.trim();

    // Validate required fields
    if (!email || !name || !password) {
      errors.push({ row: i + 1, email: email || "", error: "email, name, password are required" });
      continue;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push({ row: i + 1, email, error: "Invalid email format" });
      continue;
    }
    const pwResult = validatePassword(password);
    if (!pwResult.valid) {
      errors.push({ row: i + 1, email, error: pwResult.message });
      continue;
    }
    if (existingSet.has(email)) {
      errors.push({ row: i + 1, email, error: "Email already in use" });
      continue;
    }
    // Check for duplicates within the batch
    if (created.includes(email)) {
      errors.push({ row: i + 1, email, error: "Duplicate email in batch" });
      continue;
    }

    try {
      const hashedPassword = await bcrypt.hash(password, 12);
      await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          name,
          company: v.company?.trim() || null,
          phone: v.phone?.trim() || null,
          role: "VENDOR",
          shipyardId: shipyardId!,
          isActive: true,
          needsPasswordChange: true,
        },
      });
      created.push(email);
      existingSet.add(email);
    } catch {
      errors.push({ row: i + 1, email, error: "Failed to create" });
    }
  }

  return NextResponse.json({ created: created.length, errors });
}
