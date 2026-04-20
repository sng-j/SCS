import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, apiError } from "@/lib/auth-helpers";
import { validatePassword } from "@/lib/password-policy";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

interface UserRow {
  email: string;
  name: string;
  role: string;
  company?: string;
  phone?: string;
  password: string;
  shipyard?: string; // shipyard name — auto-resolved for SHIPYARD/VENDOR
}

/**
 * POST /api/admin/users/bulk
 * Body: { users: UserRow[] }
 * Creates multiple users at once. Supports ADMIN, SHIPYARD, VENDOR roles.
 * For SHIPYARD/VENDOR, `shipyard` column is looked up by name.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return apiError("Forbidden", 403);

  const body = await req.json();
  const rows: UserRow[] = Array.isArray(body.users) ? body.users : [];
  if (rows.length === 0) return apiError("No user rows provided", 400);

  const shipyards = await prisma.shipyard.findMany({ select: { id: true, name: true } });
  const syByName = new Map(shipyards.map((s) => [s.name.trim().toLowerCase(), s.id]));

  const existingUsers = await prisma.user.findMany({ select: { email: true } });
  const existingEmails = new Set(existingUsers.map((u) => u.email.toLowerCase()));

  let created = 0;
  const errors: { row: number; email: string; error: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const email = (r.email || "").trim().toLowerCase();
    const name = (r.name || "").trim();
    const role = (r.role || "").trim().toUpperCase();
    const password = r.password || "";

    if (!email || !name || !password || !role) {
      errors.push({ row: i + 1, email, error: "email, name, role, password required" });
      continue;
    }
    if (!["ADMIN", "SUPPORT", "SHIPYARD", "VENDOR"].includes(role)) {
      errors.push({ row: i + 1, email, error: `invalid role: ${role}` });
      continue;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push({ row: i + 1, email, error: "invalid email format" });
      continue;
    }
    const pw = validatePassword(password);
    if (!pw.valid) {
      errors.push({ row: i + 1, email, error: `password policy: ${pw.code}` });
      continue;
    }
    if (existingEmails.has(email)) {
      errors.push({ row: i + 1, email, error: "email already exists" });
      continue;
    }

    let shipyardId: string | null = null;
    if (role === "SHIPYARD" || role === "SUPPORT" || role === "VENDOR") {
      const syName = (r.shipyard || "").trim().toLowerCase();
      if (!syName) {
        errors.push({ row: i + 1, email, error: "shipyard name required for SUPPORT/SHIPYARD/VENDOR" });
        continue;
      }
      const id = syByName.get(syName);
      if (!id) {
        errors.push({ row: i + 1, email, error: `shipyard not found: ${r.shipyard}` });
        continue;
      }
      shipyardId = id;
    }

    try {
      const hash = await bcrypt.hash(password, 12);
      await prisma.user.create({
        data: {
          email,
          name,
          password: hash,
          role: role as "ADMIN" | "SUPPORT" | "SHIPYARD" | "VENDOR",
          company: r.company?.trim() || null,
          phone: r.phone?.trim() || null,
          shipyardId,
          isActive: true,
          needsPasswordChange: true,
        },
      });
      existingEmails.add(email);
      created++;
    } catch (err) {
      errors.push({ row: i + 1, email, error: err instanceof Error ? err.message : "creation failed" });
    }
  }

  return NextResponse.json({ created, errors, total: rows.length });
}
