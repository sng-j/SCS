import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, verifyProjectAccess, apiError, isWriteRole } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

/**
 * POST /api/cve/match-sbom — Batch CVE matching for SBOM components
 * Body: { runId: string }
 * Returns: { matches: [{ name, version, cves: [{ cveId, severity, score, description }] }], totalVulnerabilities: number }
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const body = await request.json();
  const { runId } = body as { runId?: string };
  if (!runId) return apiError("runId is required", 400);

  // Check cache first
  const cacheKey = `sbom-cve:${runId}`;
  const cached = await prisma.cveCache.findUnique({ where: { query: cacheKey } });
  if (cached && cached.expiresAt > new Date()) {
    const cachedResult = typeof cached.result === "string" ? JSON.parse(cached.result) : cached.result;
    return NextResponse.json(cachedResult);
  }

  // Load SBOM from audit run — with project access verification
  const run = await prisma.auditRun.findUnique({
    where: { id: runId },
    select: { sbomData: true, projectId: true },
  });
  if (!run) return apiError("Audit run not found", 404);

  const hasAccess = await verifyProjectAccess(user.id, run.projectId, user.role, user.shipyardId);
  if (!hasAccess) return apiError("Forbidden", 403);
  if (!isWriteRole(user.role)) return apiError("Read-only role cannot modify this resource", 403);

  if (!run.sbomData) return apiError("No SBOM data in this audit run", 404);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sbom: any;
  try {
    sbom = JSON.parse(run.sbomData);
  } catch {
    return apiError("Invalid SBOM data", 500);
  }

  const components = (sbom?.components ?? []) as {
    name?: string;
    version?: string;
    publisher?: string;
    cpe?: string;
    source?: string;
  }[];

  if (components.length === 0) {
    return NextResponse.json({ matches: [], totalVulnerabilities: 0 });
  }

  // Batch CVE matching
  const matches: {
    name: string;
    version: string;
    source: string;
    cves: { cveId: string; severity: string | null; score: number | null; description: string }[];
  }[] = [];

  // Process in batches of 20 to avoid overwhelming DB
  const BATCH_SIZE = 20;
  for (let i = 0; i < components.length; i += BATCH_SIZE) {
    const batch = components.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async (comp) => {
        if (!comp.name) return;

        const cves = await matchComponent(comp.name, comp.version, comp.cpe);
        if (cves.length > 0) {
          matches.push({
            name: comp.name,
            version: comp.version || "unknown",
            source: comp.source || "unknown",
            cves,
          });
        }
      })
    );
  }

  // Sort by total CVE count desc, then by highest severity
  matches.sort((a, b) => {
    const maxA = Math.max(...a.cves.map((c) => c.score ?? 0));
    const maxB = Math.max(...b.cves.map((c) => c.score ?? 0));
    return maxB - maxA;
  });

  const totalVulnerabilities = matches.reduce((sum, m) => sum + m.cves.length, 0);
  const response = { matches, totalVulnerabilities };

  // Cache for 1 hour
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await prisma.cveCache
    .upsert({
      where: { query: cacheKey },
      update: { result: JSON.stringify(response), expiresAt },
      create: { query: cacheKey, result: JSON.stringify(response), expiresAt },
    })
    .catch(() => {});

  return NextResponse.json(response);
}

/** Match a single component against CveLocal */
async function matchComponent(
  name: string,
  version: string | undefined,
  cpe: string | undefined
): Promise<{ cveId: string; severity: string | null; score: number | null; description: string }[]> {
  // Strategy 1: CPE-based matching
  if (cpe) {
    const parts = cpe.split(":");
    // cpe:2.3:a:vendor:product:version:...
    if (parts.length >= 5) {
      const rawVendor = parts[3].replace(/_/g, " ").toLowerCase();
      const rawProduct = parts[4].replace(/_/g, " ").toLowerCase();

      // Normalize vendor: "microsoft corporation" → try "microsoft", "microsoft corporation"
      const vendorVariants = [rawVendor];
      if (rawVendor.includes(" ")) vendorVariants.push(rawVendor.split(" ")[0]); // "microsoft corporation" → "microsoft"

      // Try each vendor variant
      for (const v of vendorVariants) {
        const cves = await prisma.cveLocal.findMany({
          where: {
            vendor: { contains: v },
            product: { contains: rawProduct },
          },
          select: { cveId: true, baseSeverity: true, baseScore: true, description: true, versionStart: true, versionEnd: true },
          take: 50,
        });

        const filtered = filterByVersion(cves, version);
        if (filtered.length > 0) {
          return filtered.map((c) => ({
            cveId: c.cveId,
            severity: c.baseSeverity,
            score: c.baseScore,
            description: c.description.substring(0, 200),
          }));
        }
      }

      // Also try product-only search if vendor didn't match
      if (rawProduct.length >= 3) {
        const cves = await prisma.cveLocal.findMany({
          where: { product: rawProduct },
          select: { cveId: true, baseSeverity: true, baseScore: true, description: true, versionStart: true, versionEnd: true },
          take: 30,
        });
        const filtered = filterByVersion(cves, version);
        if (filtered.length > 0) {
          return filtered.map((c) => ({
            cveId: c.cveId,
            severity: c.baseSeverity,
            score: c.baseScore,
            description: c.description.substring(0, 200),
          }));
        }
      }
    }
  }

  // Strategy 2: Name-based matching (normalize name)
  const normalized = normalizeName(name);
  if (!normalized || normalized.length < 3) return [];

  // Try exact product match first
  let cves = await prisma.cveLocal.findMany({
    where: { product: normalized },
    select: { cveId: true, baseSeverity: true, baseScore: true, description: true, versionStart: true, versionEnd: true },
    take: 30,
  });

  // If no exact match, try contains but with stricter filtering
  if (cves.length === 0 && normalized.length >= 4) {
    cves = await prisma.cveLocal.findMany({
      where: { product: { contains: normalized } },
      select: { cveId: true, baseSeverity: true, baseScore: true, description: true, versionStart: true, versionEnd: true },
      take: 20,
    });
  }

  const filtered = filterByVersion(cves, version);
  return filtered.map((c) => ({
    cveId: c.cveId,
    severity: c.baseSeverity,
    score: c.baseScore,
    description: c.description.substring(0, 200),
  }));
}

/** Normalize software name for CVE matching */
function normalizeName(name: string): string {
  // Remove version-like suffixes, parenthetical info, architecture tags
  let n = name
    .toLowerCase()
    .replace(/\s*\(.*?\)\s*/g, "")        // Remove (x64), (Preview) etc
    .replace(/\s*v?\d+[\.\d]*.*$/i, "")    // Remove trailing version numbers
    .replace(/[_\-\.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Known vendor prefixes to strip for better product matching
  const vendorPrefixes = ["microsoft", "google", "adobe", "oracle", "mozilla", "apple", "ibm"];
  for (const vp of vendorPrefixes) {
    if (n.startsWith(vp + " ") && n.length > vp.length + 3) {
      n = n.substring(vp.length + 1);
      break;
    }
  }

  // Take up to first 2-3 meaningful words (not just first word)
  const words = n.split(" ").filter((w) => w.length > 1);
  return words.slice(0, Math.min(3, words.length)).join(" ");
}

/** Filter CVEs by version range */
function filterByVersion(
  cves: {
    cveId: string;
    baseSeverity: string | null;
    baseScore: number | null;
    description: string;
    versionStart: string | null;
    versionEnd: string | null;
  }[],
  version: string | undefined
) {
  if (!version) return cves;

  return cves.filter((cve) => {
    // If no version range info, include the CVE
    if (!cve.versionStart && !cve.versionEnd) return true;

    const v = normalizeVersion(version);
    if (cve.versionStart && normalizeVersion(cve.versionStart) > v) return false;
    if (cve.versionEnd && normalizeVersion(cve.versionEnd) < v) return false;
    return true;
  });
}

/** Normalize version string for comparison */
function normalizeVersion(v: string): string {
  return v
    .split(".")
    .map((p) => p.padStart(8, "0"))
    .join(".");
}
