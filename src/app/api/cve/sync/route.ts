import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, apiError } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

const NVD_API_BASE = "https://services.nvd.nist.gov/rest/json/cves/2.0";
const NVD_API_KEY = process.env.NVD_API_KEY || "";
const BATCH_SIZE = NVD_API_KEY ? 2000 : 100;

/**
 * Extract CVSS v3.1 or v3.0 metrics from an NVD CVE item.
 * Falls back to v2.0 if v3 is unavailable.
 */
function extractCvssMetrics(cveItem: NvdCveItem): { baseScore: number | null; baseSeverity: string | null } {
  const metrics = cveItem.cve?.metrics;
  if (!metrics) return { baseScore: null, baseSeverity: null };

  // Try CVSS v3.1 first
  const v31 = metrics.cvssMetricV31?.[0]?.cvssData;
  if (v31) {
    return { baseScore: v31.baseScore ?? null, baseSeverity: v31.baseSeverity ?? null };
  }

  // Try CVSS v3.0
  const v30 = metrics.cvssMetricV30?.[0]?.cvssData;
  if (v30) {
    return { baseScore: v30.baseScore ?? null, baseSeverity: v30.baseSeverity ?? null };
  }

  // Try CVSS v2
  const v2 = metrics.cvssMetricV2?.[0]?.cvssData;
  if (v2) {
    return { baseScore: v2.baseScore ?? null, baseSeverity: v2.baseSeverity ?? null };
  }

  return { baseScore: null, baseSeverity: null };
}

/**
 * Extract the first vendor/product from CPE configurations.
 */
function extractVendorProduct(cveItem: NvdCveItem): { vendor: string | null; product: string | null; versionStart: string | null; versionEnd: string | null } {
  const result = { vendor: null as string | null, product: null as string | null, versionStart: null as string | null, versionEnd: null as string | null };

  const configurations = cveItem.cve?.configurations;
  if (!configurations?.length) return result;

  for (const config of configurations) {
    const nodes = config.nodes;
    if (!nodes?.length) continue;

    for (const node of nodes) {
      const cpeMatches = node.cpeMatch;
      if (!cpeMatches?.length) continue;

      for (const match of cpeMatches) {
        const cpe = match.criteria;
        if (!cpe || !cpe.startsWith("cpe:2.3:")) continue;

        const parts = cpe.split(":");
        if (parts.length >= 5 && parts[3] !== "*" && parts[4] !== "*") {
          result.vendor = parts[3].toLowerCase();
          result.product = parts[4].toLowerCase();
          result.versionStart = match.versionStartIncluding ?? match.versionStartExcluding ?? null;
          result.versionEnd = match.versionEndIncluding ?? match.versionEndExcluding ?? null;
          return result;
        }
      }
    }
  }

  return result;
}

/**
 * Extract the English description from the CVE item.
 */
function extractDescription(cveItem: NvdCveItem): string {
  const descriptions = cveItem.cve?.descriptions;
  if (!descriptions?.length) return "";

  const en = descriptions.find((d: NvdDescription) => d.lang === "en");
  return en?.value || descriptions[0]?.value || "";
}

// ─── NVD Response types ──────────────────────────────────────────────────────

interface NvdDescription {
  lang: string;
  value: string;
}

interface NvdCvssData {
  baseScore?: number;
  baseSeverity?: string;
}

interface NvdCvssMetric {
  cvssData?: NvdCvssData;
}

interface NvdCpeMatch {
  criteria?: string;
  versionStartIncluding?: string;
  versionStartExcluding?: string;
  versionEndIncluding?: string;
  versionEndExcluding?: string;
}

interface NvdConfigNode {
  cpeMatch?: NvdCpeMatch[];
}

interface NvdConfiguration {
  nodes?: NvdConfigNode[];
}

interface NvdCveData {
  id?: string;
  published?: string;
  lastModified?: string;
  descriptions?: NvdDescription[];
  metrics?: {
    cvssMetricV31?: NvdCvssMetric[];
    cvssMetricV30?: NvdCvssMetric[];
    cvssMetricV2?: NvdCvssMetric[];
  };
  configurations?: NvdConfiguration[];
}

interface NvdCveItem {
  cve?: NvdCveData;
}

interface NvdApiResponse {
  resultsPerPage?: number;
  startIndex?: number;
  totalResults?: number;
  vulnerabilities?: NvdCveItem[];
}

// ─── GET: Sync status ────────────────────────────────────────────────────────

/** GET /api/cve/sync — Get NVD sync status */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const syncState = await prisma.cveSyncState.findUnique({
    where: { id: 1 },
  });

  const totalCves = await prisma.cveLocal.count();

  return NextResponse.json({
    syncState: syncState || {
      id: 1,
      lastSync: null,
      lastIndex: 0,
      totalResults: 0,
      status: "idle",
      updatedAt: null,
    },
    totalCvesInDb: totalCves,
  });
}

// ─── POST: Trigger one batch of NVD sync ─────────────────────────────────────

/** POST /api/cve/sync — Trigger NVD sync (ADMIN only) */
export async function POST() {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);
  if (user.role !== "ADMIN") return apiError("Forbidden — Admin only", 403);

  // Get or create sync state
  let syncState = await prisma.cveSyncState.findUnique({
    where: { id: 1 },
  });

  if (!syncState) {
    syncState = await prisma.cveSyncState.create({
      data: { id: 1, status: "idle", lastIndex: 0, totalResults: 0 },
    });
  }

  // Prevent concurrent syncs
  if (syncState.status === "syncing") {
    return apiError("Sync already in progress", 409);
  }

  // Mark as syncing
  await prisma.cveSyncState.update({
    where: { id: 1 },
    data: { status: "syncing" },
  });

  try {
    const startIndex = syncState.lastIndex;

    // Delta sync: if we have a previous sync, only fetch CVEs modified since then
    const params = new URLSearchParams({
      resultsPerPage: String(BATCH_SIZE),
      startIndex: String(startIndex),
    });

    if (syncState.lastSync && syncState.status === "complete") {
      // Fetch only modified CVEs since last sync (delta mode)
      const since = new Date(syncState.lastSync.getTime() - 24 * 60 * 60 * 1000); // 1 day buffer
      params.set("lastModStartDate", since.toISOString());
      params.set("lastModEndDate", new Date().toISOString());
    }

    const url = `${NVD_API_BASE}?${params.toString()}`;

    const headers: Record<string, string> = {
      "User-Agent": "SCS-v13-CVE-Scanner/1.0",
    };
    if (NVD_API_KEY) headers["apiKey"] = NVD_API_KEY;

    const nvdResponse = await fetch(url, { headers });

    if (!nvdResponse.ok) {
      const errorText = await nvdResponse.text().catch(() => "Unknown error");

      // Reset status on failure
      await prisma.cveSyncState.update({
        where: { id: 1 },
        data: { status: "error" },
      });

      if (nvdResponse.status === 403 || nvdResponse.status === 429) {
        return apiError(
          `NVD rate limit exceeded. Wait 30 seconds and try again. (${nvdResponse.status})`,
          429,
        );
      }

      return apiError(`NVD API error: ${nvdResponse.status} — ${errorText.substring(0, 200)}`, 502);
    }

    const data: NvdApiResponse = await nvdResponse.json();

    const totalResults = data.totalResults ?? 0;
    const vulnerabilities = data.vulnerabilities ?? [];
    let upsertedCount = 0;

    for (const item of vulnerabilities) {
      const cveId = item.cve?.id;
      if (!cveId) continue;

      const description = extractDescription(item);
      const { baseScore, baseSeverity } = extractCvssMetrics(item);
      const { vendor, product, versionStart, versionEnd } = extractVendorProduct(item);

      const publishedAt = item.cve?.published ? new Date(item.cve.published) : null;
      const modifiedAt = item.cve?.lastModified ? new Date(item.cve.lastModified) : null;

      await prisma.cveLocal.upsert({
        where: { cveId },
        update: {
          description,
          baseScore,
          baseSeverity: baseSeverity?.toUpperCase() ?? null,
          vendor,
          product,
          versionStart,
          versionEnd,
          publishedAt,
          modifiedAt,
          rawJson: JSON.stringify(item),
        },
        create: {
          cveId,
          description,
          baseScore,
          baseSeverity: baseSeverity?.toUpperCase() ?? null,
          vendor,
          product,
          versionStart,
          versionEnd,
          publishedAt,
          modifiedAt,
          rawJson: JSON.stringify(item),
        },
      });
      upsertedCount++;
    }

    // Update sync state
    const newIndex = startIndex + vulnerabilities.length;
    const isComplete = newIndex >= totalResults;

    await prisma.cveSyncState.update({
      where: { id: 1 },
      data: {
        lastSync: new Date(),
        lastIndex: isComplete ? 0 : newIndex,
        totalResults,
        status: isComplete ? "complete" : "idle",
      },
    });

    return NextResponse.json({
      message: isComplete ? "NVD sync complete — all CVEs fetched" : "Batch sync complete",
      batch: {
        startIndex,
        fetched: vulnerabilities.length,
        upserted: upsertedCount,
      },
      progress: {
        totalResults,
        currentIndex: newIndex,
        remaining: Math.max(0, totalResults - newIndex),
        isComplete,
      },
    });
  } catch (error: unknown) {
    // Reset status on unexpected error
    await prisma.cveSyncState.update({
      where: { id: 1 },
      data: { status: "error" },
    }).catch(() => {
      // Ignore nested error
    });

    const message = error instanceof Error ? error.message : "Sync failed";
    return apiError(`NVD sync error: ${message}`, 500);
  }
}
