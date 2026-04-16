import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, apiError } from "@/lib/auth-helpers";
import { invalidateLockoutConfigCache } from "@/lib/auth";

export const dynamic = "force-dynamic";

const DEFAULT_SETTINGS: Record<string, string> = {
  session_timeout: "30",
  max_upload_size: "10",
  login_lockout_attempts: "5",
  login_lockout_duration: "15",
  maintenance_mode: "false",
  signup_enabled: "false",
};

/**
 * Ensure all default settings exist in the database.
 * Creates any missing settings with their default values.
 */
async function ensureDefaults(): Promise<void> {
  const existing = await prisma.setting.findMany();
  const existingKeys = new Set(existing.map((s) => s.key));

  const missing = Object.entries(DEFAULT_SETTINGS).filter(
    ([key]) => !existingKeys.has(key),
  );

  for (const [key, value] of missing) {
    await prisma.setting.create({ data: { key, value } }).catch(() => {});
  }
}

/** GET /api/admin/settings — return all settings as key-value pairs (ADMIN only) */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);
  if (user.role !== "ADMIN") return apiError("Forbidden", 403);

  await ensureDefaults();

  const settings = await prisma.setting.findMany({
    orderBy: { key: "asc" },
  });

  const result: Record<string, string> = {};
  for (const s of settings) {
    result[s.key] = s.value;
  }

  return NextResponse.json(result);
}

/** PATCH /api/admin/settings — update a single setting (ADMIN only) */
export async function PATCH(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);
  if (user.role !== "ADMIN") return apiError("Forbidden", 403);

  try {
    const body = await request.json();
    const { key, value } = body;

    if (!key || typeof key !== "string") {
      return apiError("key is required and must be a string", 400);
    }
    if (value === undefined || value === null) {
      return apiError("value is required", 400);
    }

    const stringValue = String(value);

    // Restrict writes to the small set of settings actually consumed at runtime.
    // Arbitrary keys could create a misleading admin UI where editable values
    // have no effect on behavior.
    const ALLOWED_KEYS = new Set([
      "session_timeout",
      "max_upload_size",
      "login_lockout_attempts",
      "login_lockout_duration",
      "maintenance_mode",
      "signup_enabled",
    ]);
    if (!ALLOWED_KEYS.has(key)) {
      return apiError(`Unknown setting key: ${key}`, 400);
    }

    const updated = await prisma.setting.upsert({
      where: { key },
      update: { value: stringValue },
      create: { key, value: stringValue },
    });

    // Drop any in-memory caches that rely on this value.
    if (key === "login_lockout_attempts" || key === "login_lockout_duration") {
      invalidateLockoutConfigCache();
    }

    return NextResponse.json({ key: updated.key, value: updated.value });
  } catch {
    return apiError("Failed to update setting", 500);
  }
}
