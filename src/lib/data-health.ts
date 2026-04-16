/**
 * Data-health diagnostics & auto-fixer.
 *
 * Detects and (where safe) automatically corrects structural inconsistencies
 * in tenant data — the kind of mess that accumulates when shipyards, users,
 * and equipment get created independently with slightly mismatched references.
 *
 * Issues handled:
 * - Orphan shipyards: no users, no projects, no project-groups → safe to remove.
 * - Empty shipyards with users: SHIPYARD user attached to a shipyard that has
 *   no projects, while another shipyard with a similar name DOES have projects
 *   → merge users into the populated shipyard.
 * - Duplicate shipyard names (case-insensitive after normalization) → merge
 *   into the oldest record.
 * - Vendor/equipment mismatch: VENDOR user's shipyardId differs from the
 *   shipyardId of any project that hosts their equipment → align vendor to
 *   the project's shipyard.
 * - Orphan projects: shipyardId points to a non-existent shipyard row → flagged
 *   (cannot auto-fix without operator input).
 * - Equipment whose project no longer exists → flagged.
 *
 * The diagnose pass is read-only and safe to run anywhere; the auto-fix pass
 * mutates data and should be invoked by an authenticated admin (or via the CLI
 * by an operator with shell access).
 *
 * NOTE: this module deliberately uses `prismaRaw` so that soft-deleted rows
 * are still visible to the diagnostic. The fixer uses the extended `prisma`
 * client so that any deletes go through the soft-delete pipeline.
 */

import { prisma, prismaRaw } from "./prisma";

// ── Types ───────────────────────────────────────────────────────────────────

export interface OrphanShipyard {
  type: "orphan_shipyard";
  shipyardId: string;
  name: string;
}

export interface DuplicateShipyards {
  type: "duplicate_shipyards";
  normalizedName: string;
  shipyards: { id: string; name: string; createdAt: Date; userCount: number; projectCount: number }[];
}

export interface EmptyShipyardUser {
  type: "empty_shipyard_user";
  userId: string;
  email: string;
  currentShipyardId: string;
  currentShipyardName: string;
  suggestedShipyardId: string | null;
  suggestedShipyardName: string | null;
}

export interface VendorEquipmentMismatch {
  type: "vendor_equipment_mismatch";
  vendorId: string;
  vendorEmail: string;
  vendorShipyardId: string | null;
  projectShipyardIds: string[];
}

export interface OrphanProject {
  type: "orphan_project";
  projectId: string;
  vesselName: string;
  danglingShipyardId: string;
}

export type DataHealthIssue =
  | OrphanShipyard
  | DuplicateShipyards
  | EmptyShipyardUser
  | VendorEquipmentMismatch
  | OrphanProject;

export interface DataHealthReport {
  issues: DataHealthIssue[];
  summary: {
    total: number;
    byType: Record<string, number>;
  };
}

export interface FixResult {
  applied: {
    type: string;
    description: string;
  }[];
  skipped: {
    type: string;
    description: string;
    reason: string;
  }[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Normalize a shipyard name for fuzzy comparison. Lowercases, strips
 * whitespace, removes common corporate suffixes, and treats Hangul/Latin
 * separately so "Korea Maritime" and "Korea  maritime" collapse to one key
 * but still won't accidentally match "한국해양".
 */
export function normalizeShipyardName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/(corp|corporation|inc|ltd|co|co\.|company|industries|industry|heavy|shipyard)/g, "")
    .trim();
}

// ── Diagnose ────────────────────────────────────────────────────────────────

export async function diagnoseDataHealth(): Promise<DataHealthReport> {
  const issues: DataHealthIssue[] = [];

  // ── 1. Orphan shipyards (no live users, no live projects) ───────────
  // _count must filter by deletedAt:null because we use prismaRaw to bypass
  // the soft-delete extension. Empty project groups attached to an otherwise
  // empty shipyard are not protective — the auto-fixer cleans them up too.
  const allShipyards = await prismaRaw.shipyard.findMany({
    where: { deletedAt: null },
    include: {
      _count: {
        select: {
          users: { where: { deletedAt: null } },
          projects: { where: { deletedAt: null } },
          projectGroups: { where: { deletedAt: null } },
        },
      },
    },
  });

  for (const sy of allShipyards) {
    // Treat the shipyard as orphan when it has no live users and no live
    // projects. Lingering empty project groups don't keep it alive.
    if (sy._count.users === 0 && sy._count.projects === 0) {
      issues.push({ type: "orphan_shipyard", shipyardId: sy.id, name: sy.name });
    }
  }

  // ── 2. Duplicate shipyard names (after normalization) ────────────────
  const groups = new Map<string, typeof allShipyards>();
  for (const sy of allShipyards) {
    const key = normalizeShipyardName(sy.name);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(sy);
  }
  for (const [normalizedName, group] of groups) {
    if (group.length < 2) continue;
    issues.push({
      type: "duplicate_shipyards",
      normalizedName,
      shipyards: group
        .map((s) => ({
          id: s.id,
          name: s.name,
          createdAt: s.createdAt,
          userCount: s._count.users,
          projectCount: s._count.projects,
        }))
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
    });
  }

  // ── 3. SHIPYARD users in empty shipyards ─────────────────────────────
  const shipyardUsers = await prismaRaw.user.findMany({
    where: { role: "SHIPYARD", deletedAt: null, shipyardId: { not: null } },
    select: { id: true, email: true, company: true, name: true, shipyardId: true },
  });

  for (const u of shipyardUsers) {
    if (!u.shipyardId) continue;
    const sy = allShipyards.find((s) => s.id === u.shipyardId);
    if (!sy) {
      // shipyardId points to a deleted/missing shipyard — flag as orphan-style issue
      issues.push({
        type: "empty_shipyard_user",
        userId: u.id,
        email: u.email,
        currentShipyardId: u.shipyardId,
        currentShipyardName: "(missing)",
        suggestedShipyardId: null,
        suggestedShipyardName: null,
      });
      continue;
    }
    if (sy._count.projects > 0) continue; // already healthy

    // Suggest a populated shipyard whose name normalizes to the same key
    // as the user's company OR their current shipyard.
    const candidates = [u.company, sy.name].filter((v): v is string => !!v).map(normalizeShipyardName);
    let suggested: typeof allShipyards[number] | undefined;
    for (const sy2 of allShipyards) {
      if (sy2.id === sy.id) continue;
      if (sy2._count.projects === 0) continue;
      const k = normalizeShipyardName(sy2.name);
      if (candidates.includes(k)) {
        suggested = sy2;
        break;
      }
    }

    issues.push({
      type: "empty_shipyard_user",
      userId: u.id,
      email: u.email,
      currentShipyardId: sy.id,
      currentShipyardName: sy.name,
      suggestedShipyardId: suggested?.id ?? null,
      suggestedShipyardName: suggested?.name ?? null,
    });
  }

  // ── 4. Vendor/equipment shipyard mismatch ────────────────────────────
  const vendors = await prismaRaw.user.findMany({
    where: { role: "VENDOR", deletedAt: null },
    select: {
      id: true,
      email: true,
      shipyardId: true,
      vendorEquipments: {
        where: { deletedAt: null },
        select: { project: { select: { shipyardId: true } } },
      },
    },
  });

  for (const v of vendors) {
    if (v.vendorEquipments.length === 0) continue;
    const projShipyardIds = Array.from(
      new Set(
        v.vendorEquipments
          .map((e) => e.project?.shipyardId)
          .filter((id): id is string => !!id),
      ),
    );
    if (projShipyardIds.length === 0) continue;
    // Mismatch if vendor's shipyardId is null OR not equal to any project's shipyardId
    if (!v.shipyardId || !projShipyardIds.includes(v.shipyardId)) {
      issues.push({
        type: "vendor_equipment_mismatch",
        vendorId: v.id,
        vendorEmail: v.email,
        vendorShipyardId: v.shipyardId,
        projectShipyardIds: projShipyardIds,
      });
    }
  }

  // ── 5. Orphan projects (shipyardId points to nothing) ────────────────
  const projects = await prismaRaw.project.findMany({
    where: { deletedAt: null, shipyardId: { not: null } },
    select: { id: true, vesselName: true, shipyardId: true },
  });
  const validShipyardIds = new Set(allShipyards.map((s) => s.id));
  for (const p of projects) {
    if (p.shipyardId && !validShipyardIds.has(p.shipyardId)) {
      issues.push({
        type: "orphan_project",
        projectId: p.id,
        vesselName: p.vesselName,
        danglingShipyardId: p.shipyardId,
      });
    }
  }

  // Build summary
  const byType: Record<string, number> = {};
  for (const issue of issues) {
    byType[issue.type] = (byType[issue.type] || 0) + 1;
  }
  return { issues, summary: { total: issues.length, byType } };
}

// ── Auto-fix ────────────────────────────────────────────────────────────────

/**
 * Apply safe fixes for the issues found by `diagnoseDataHealth`.
 *
 * Safe operations:
 * - Soft-delete orphan shipyards.
 * - Merge duplicate shipyards into the oldest member.
 * - Reassign SHIPYARD users with a clear suggested target (name match).
 * - Align vendor.shipyardId to the (single) project.shipyardId of their equipment.
 *
 * Aggressive mode (`opts.aggressive = true`) additionally enables:
 * - Single-active-shipyard heuristic: if the system contains exactly one
 *   shipyard with active projects, any SHIPYARD user stuck in an empty
 *   shipyard is moved to that shipyard. Safe in single-tenant deployments;
 *   in multi-tenant setups it would risk cross-tenant data exposure, so it
 *   is opt-in.
 *
 * Unsafe / skipped operations (require operator decision):
 * - SHIPYARD user in an empty shipyard with no clear suggestion (non-aggressive).
 * - Orphan projects (dangling shipyardId).
 * - Vendor equipment spanning multiple shipyards (ambiguous).
 */
export async function autoFixDataHealth(opts: { aggressive?: boolean } = {}): Promise<FixResult> {
  const applied: FixResult["applied"] = [];
  const skipped: FixResult["skipped"] = [];

  const report = await diagnoseDataHealth();

  // 1. Merge duplicates first — keeps subsequent passes simpler.
  for (const issue of report.issues) {
    if (issue.type !== "duplicate_shipyards") continue;
    const [keep, ...drop] = issue.shipyards;
    for (const d of drop) {
      // Re-point all references from the dropped shipyard to the keeper.
      await prismaRaw.user.updateMany({
        where: { shipyardId: d.id },
        data: { shipyardId: keep.id },
      });
      await prismaRaw.project.updateMany({
        where: { shipyardId: d.id },
        data: { shipyardId: keep.id },
      });
      await prismaRaw.projectGroup.updateMany({
        where: { shipyardId: d.id },
        data: { shipyardId: keep.id },
      });
      await prisma.shipyard.delete({ where: { id: d.id } });
      applied.push({
        type: "duplicate_shipyards",
        description: `Merged shipyard "${d.name}" (${d.id}) into "${keep.name}" (${keep.id})`,
      });
    }
  }

  // 2. Empty SHIPYARD users with a suggested target.
  // In aggressive mode, fall back to the single-active-shipyard heuristic.
  let aggressiveTargetId: string | null = null;
  let aggressiveTargetName: string | null = null;
  if (opts.aggressive) {
    const populated = await prismaRaw.shipyard.findMany({
      where: { deletedAt: null },
      include: { _count: { select: { projects: true } } },
    });
    const withProjects = populated.filter((s) => s._count.projects > 0);
    if (withProjects.length === 1) {
      aggressiveTargetId = withProjects[0].id;
      aggressiveTargetName = withProjects[0].name;
    }
  }

  for (const issue of report.issues) {
    if (issue.type !== "empty_shipyard_user") continue;

    let targetId = issue.suggestedShipyardId;
    let targetName = issue.suggestedShipyardName;

    if (!targetId && aggressiveTargetId && aggressiveTargetId !== issue.currentShipyardId) {
      targetId = aggressiveTargetId;
      targetName = aggressiveTargetName;
    }

    if (!targetId) {
      skipped.push({
        type: issue.type,
        description: `User ${issue.email} is in empty shipyard "${issue.currentShipyardName}"`,
        reason: opts.aggressive
          ? "No populated shipyard found and there is no single active shipyard to fall back to."
          : "No populated shipyard with a matching normalized name was found — re-run with --aggressive to apply the single-active-shipyard heuristic.",
      });
      continue;
    }

    await prismaRaw.user.update({
      where: { id: issue.userId },
      data: { shipyardId: targetId },
    });
    applied.push({
      type: issue.type,
      description: `Reassigned ${issue.email} from "${issue.currentShipyardName}" to "${targetName}"`,
    });
  }

  // 3. Vendor/equipment mismatch.
  for (const issue of report.issues) {
    if (issue.type !== "vendor_equipment_mismatch") continue;
    if (issue.projectShipyardIds.length !== 1) {
      skipped.push({
        type: issue.type,
        description: `Vendor ${issue.vendorEmail} has equipment across ${issue.projectShipyardIds.length} shipyards`,
        reason: "Cannot auto-pick a single shipyard — operator must split the equipment or reassign vendor manually.",
      });
      continue;
    }
    await prismaRaw.user.update({
      where: { id: issue.vendorId },
      data: { shipyardId: issue.projectShipyardIds[0] },
    });
    applied.push({
      type: issue.type,
      description: `Aligned vendor ${issue.vendorEmail} to shipyard ${issue.projectShipyardIds[0]}`,
    });
  }

  // 4. Orphan shipyards last (so we don't drop a shipyard that another fix
  //    would have populated). Also clean up any empty project groups still
  //    attached, otherwise the soft-delete extension would refuse to drop
  //    them and the operator would see the same orphan on the next sweep.
  const reReport = await diagnoseDataHealth();
  for (const issue of reReport.issues) {
    if (issue.type !== "orphan_shipyard") continue;
    // Remove dangling empty project groups under this shipyard.
    await prisma.projectGroup.deleteMany({ where: { shipyardId: issue.shipyardId } });
    await prisma.shipyard.delete({ where: { id: issue.shipyardId } });
    applied.push({
      type: issue.type,
      description: `Removed orphan shipyard "${issue.name}" (${issue.shipyardId})`,
    });
  }

  // 5. Orphan projects — flagged only.
  for (const issue of reReport.issues) {
    if (issue.type !== "orphan_project") continue;
    skipped.push({
      type: issue.type,
      description: `Project "${issue.vesselName}" (${issue.projectId}) references missing shipyard ${issue.danglingShipyardId}`,
      reason: "Operator must choose a replacement shipyard or delete the project.",
    });
  }

  return { applied, skipped };
}

// ── Helper for create-time normalization ────────────────────────────────────

/**
 * Find or create a shipyard for a given name, performing normalized lookup
 * to avoid producing duplicate-by-spelling rows. Use this from all SHIPYARD
 * creation entry points (admin/users POST, admin/shipyards POST, etc.).
 */
export async function findOrCreateShipyardByName(
  rawName: string,
  extra?: { address?: string | null; phone?: string | null; contact?: string | null },
): Promise<{ id: string; name: string; created: boolean }> {
  const name = rawName.trim();
  if (!name) throw new Error("Shipyard name is required");

  const normalized = normalizeShipyardName(name);

  // Search candidates: same exact name first, then any name normalizing to
  // the same key. Restrict to non-deleted rows.
  const exact = await prismaRaw.shipyard.findFirst({
    where: { name, deletedAt: null },
    select: { id: true, name: true },
  });
  if (exact) return { ...exact, created: false };

  if (normalized) {
    const candidates = await prismaRaw.shipyard.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
    });
    const match = candidates.find((c) => normalizeShipyardName(c.name) === normalized);
    if (match) return { ...match, created: false };
  }

  const created = await prismaRaw.shipyard.create({
    data: {
      name,
      address: extra?.address ?? null,
      phone: extra?.phone ?? null,
      contact: extra?.contact ?? null,
    },
    select: { id: true, name: true },
  });
  return { ...created, created: true };
}
