import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getSessionUser, apiError } from "@/lib/auth-helpers";
import { safeError } from "@/lib/safe-log";
import { deriveAuditPin } from "@/lib/audit-pin";
import { buildE27, type E27Item } from "@/lib/audit-e27";
import { autoMatchCveForSoftware } from "@/lib/cve-auto-match";

export const dynamic = "force-dynamic";

// ─── Strip garbage bytes (matches v12 strip_garbage) ─────────────────────────
function stripGarbage(data: Buffer, interval: number): Buffer {
  const out: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i % (interval + 1) !== interval) {
      out.push(data[i]);
    }
  }
  return Buffer.from(out);
}

// E27 check logic lives in @/lib/audit-e27 so the same evaluation is used by
// client-side renderers (AuditResultViewer) without duplication.

/** POST /api/vendor/audit-tools/upload — upload .scsaudit, auto-decrypt, analyze */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const equipmentId = formData.get("equipmentId") as string | null;
    const hardwareId = formData.get("hardwareId") as string | null;
    const deviceName = formData.get("deviceName") as string | null;

    if (!file) return apiError("file is required", 400);
    if (!equipmentId) return apiError("equipmentId is required", 400);

    // Verify vendor owns equipment
    const equipment = await prisma.equipment.findFirst({
      where: {
        id: equipmentId,
        OR: [
          { vendorId: user.id },
          { vendors: { some: { id: user.id } } }
        ]
      },
      select: { id: true, projectId: true, status: true, certificationInfo: true },
    });
    if (!equipment) return apiError("Equipment not found or access denied", 403);
    if (["SUBMITTED", "APPROVED"].includes(equipment.status)) {
      return apiError("Cannot modify submitted/approved equipment", 403);
    }

    // Derive PIN deterministically — matches the one embedded in the downloaded audit tool.
    // Legacy fallback: equipment recorded before V-07 fix had a random PIN stored in
    // certificationInfo.auditPin; try the derived PIN first, then the legacy one.
    const pin = deriveAuditPin(equipmentId);
    let legacyPin: string | undefined;
    if (equipment.certificationInfo) {
      try {
        const certInfo = JSON.parse(equipment.certificationInfo as string) as Record<string, unknown>;
        if (typeof certInfo.auditPin === "string") legacyPin = certInfo.auditPin;
      } catch { /* ignore malformed JSON */ }
    }

    // Read file content
    const fileRaw = Buffer.from(await file.arrayBuffer()).toString("ascii").trim();

    // ─── Auto-detect format and decrypt ──────────────────────────────
    let json: string | null = null;
    let salt: Buffer | null = null;
    let iv: Buffer | null = null;
    let cipher: Buffer | null = null;

    const tryRaw = Buffer.from(fileRaw, "base64");

    if (tryRaw.length > 40 && tryRaw.subarray(0, 7).toString("ascii") === "SCSDAT2") {
      const gi = tryRaw[7];
      salt = tryRaw.subarray(8, 24);
      iv = tryRaw.subarray(24, 40);
      cipher = stripGarbage(tryRaw.subarray(40), gi);
    } else if (tryRaw.length > 41 && tryRaw.subarray(0, 9).toString("ascii") === "SCSAUDIT1") {
      salt = tryRaw.subarray(9, 25);
      iv = tryRaw.subarray(25, 41);
      cipher = tryRaw.subarray(41);
    } else {
      try {
        const plainText = tryRaw.toString("utf-8");
        JSON.parse(plainText);
        json = plainText;
      } catch {
        return apiError("Invalid file format", 400);
      }
    }

    if (json === null && salt && iv && cipher) {
      const tryDecrypt = (candidate: string): string | null => {
        try {
          const key = crypto.pbkdf2Sync(candidate, salt!, 100000, 32, "sha256");
          const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv!);
          return Buffer.concat([decipher.update(cipher!), decipher.final()]).toString("utf-8");
        } catch {
          return null;
        }
      };
      json = tryDecrypt(pin);
      if (json === null && legacyPin) json = tryDecrypt(legacyPin);
      if (json === null) {
        return apiError("Decryption failed — PIN mismatch or corrupted file", 400);
      }
    }

    if (!json) return apiError("Decryption produced empty result", 400);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: any;
    try { data = JSON.parse(json); } catch { return apiError("Invalid JSON in decrypted content", 400); }

    // ─── PLC audit type ──────────────────────────────────────────────
    if (data.audit_type === "plc") {
      const summary = data.summary ?? {};
      const passCount = parseInt(summary.applied ?? "0");
      const failCount = parseInt(summary.not_applied ?? "0");

      const run = await prisma.auditRun.create({
        data: {
          projectId: equipment.projectId,
          equipmentId,
          hardwareId: hardwareId || null,
          platform: "PLC",
          results: JSON.stringify(data),
        },
      });

      return NextResponse.json({
        id: run.id,
        auditType: "plc",
        device: deviceName || data.device || "PLC",
        e27: { pass: passCount, fail: failCount, total: passCount + failCount, items: [] },
      });
    }

    // ─── Windows/Linux audit ──────────────────────────────────────────
    const sysinfo = data.SystemInfo ?? {};
    const e27 = buildE27(data);
    // Platform 필드(linux_audit.py가 'linux'으로 명시) 우선, OS 문자열 fallback
    const plat = (sysinfo.Platform || "").toString().toLowerCase();
    const osStr = (sysinfo.OS || "").toString().toLowerCase();
    const detectedPlatform = plat === "linux" || osStr.includes("linux") || osStr.includes("ubuntu") || osStr.includes("centos") || osStr.includes("debian") || osStr.includes("rhel") || osStr.includes("fedora") ? "LINUX" : "WINDOWS";

    const run = await prisma.auditRun.create({
      data: {
        projectId: equipment.projectId,
        equipmentId,
        hardwareId: hardwareId || null,
        platform: detectedPlatform,
        results: JSON.stringify(data),
        sbomData: data.SBOM || data.sbom ? JSON.stringify(data.SBOM ?? data.sbom) : null,
      },
    });

    // ─── Auto-map assets from SystemInfo ─────────────────────────────
    const autoMapped = { hardware: 0, software: 0, replaced: 0, hwUpdated: 0 };
    try {
      // Helpers to derive HW form fields from the audit payload. Same
      // mapping works for Windows (SystemInfo.* fields) and Linux (DMI +
      // NetworkSettings.interfaces + OpenPorts) because linux_audit.py now
      // also publishes Manufacturer/Model under SystemInfo.
      const net = (data.NetworkSettings ?? {}) as { interfaces?: { name?: string; mac?: string; addrs?: string[]; state?: string }[] };
      const firstIf = (net.interfaces || []).find((i) => {
        const n = (i.name || "").toLowerCase();
        if (n === "lo" || n.startsWith("docker") || n.startsWith("br-") || n.startsWith("veth")) return false;
        const addrs = i.addrs || [];
        return addrs.some((a) => a && !a.startsWith("127."));
      });
      const firstIpRaw = (firstIf?.addrs || []).find((a) => a && !a.startsWith("127."));
      // Strip CIDR suffix and any IPv6 for the primary IP field; keep the
      // full form in the report.
      const primaryIp = firstIpRaw ? firstIpRaw.split("/")[0] : null;
      const primaryMac = firstIf?.mac || null;

      // Summarise listening ports into a "SSH:22, HTTP:80" style string for
      // the comms-protocols field. SystemInfo.OpenPorts on Linux, Windows
      // uses Services list of listening ports too.
      const ports = (data.OpenPorts ?? []) as { Port?: number; Process?: string }[];
      const protoSummary = ports.length > 0
        ? [...new Set(ports.map((p) => {
            const proc = (p.Process || "").split("/")[0].trim();
            return proc ? `${proc.toUpperCase()}:${p.Port}` : `${p.Port}`;
          }))].slice(0, 12).join(", ")
        : null;

      // Physical interface summary from NIC list — "eth0 (Ethernet), wlan0 (WLAN)".
      const ifSummary = (net.interfaces || [])
        .filter((i) => i.name && i.name !== "lo")
        .map((i) => {
          const n = (i.name || "").toLowerCase();
          const kind = n.startsWith("wl") ? "WLAN" : n.startsWith("en") || n.startsWith("eth") ? "Ethernet" : "Other";
          return `${i.name} (${kind})`;
        })
        .slice(0, 8)
        .join(", ") || null;

      // Auto-create Hardware from SystemInfo if equipment has none
      const hwCount = await prisma.hardware.count({ where: { equipmentId } });
      if (hwCount === 0 && sysinfo.ComputerName) {
        await prisma.hardware.create({
          data: {
            projectId: equipment.projectId,
            equipmentId,
            name: deviceName || sysinfo.ComputerName,
            type: "PC",
            manufacturer: sysinfo.Manufacturer || null,
            model: sysinfo.Model || null,
            ipAddress: primaryIp,
            macAddress: primaryMac,
            physicalInterface: ifSummary,
            commProtocols: protoSummary,
            sysSoftwareCategory: sysinfo.OS ? String(sysinfo.OS).split(" ")[0] : null,
            sysSoftwareVersion: sysinfo.OSVersion ? String(sysinfo.OSVersion) : null,
          },
        });
        autoMapped.hardware++;
      }

      // If the upload targeted a specific Hardware row, backfill any form
      // fields the user hasn't filled in manually. We only touch fields
      // that are currently null/empty — never overwrite what a person
      // typed on the inventory form.
      if (hardwareId) {
        const hw = await prisma.hardware.findUnique({
          where: { id: hardwareId },
          select: {
            id: true, manufacturer: true, model: true, ipAddress: true, macAddress: true,
            physicalInterface: true, commProtocols: true,
            sysSoftwareCategory: true, sysSoftwareVersion: true,
          },
        });
        if (hw) {
          const patch: Record<string, string | null> = {};
          const blank = (v: string | null | undefined) => v === null || v === undefined || v === "";
          // Design-time specs: fill only when empty (don't clobber manual entries).
          if (blank(hw.manufacturer) && sysinfo.Manufacturer) patch.manufacturer = String(sysinfo.Manufacturer);
          if (blank(hw.model) && sysinfo.Model) patch.model = String(sysinfo.Model);
          if (blank(hw.ipAddress) && primaryIp) patch.ipAddress = primaryIp;
          if (blank(hw.macAddress) && primaryMac) patch.macAddress = primaryMac;
          if (blank(hw.physicalInterface) && ifSummary) patch.physicalInterface = ifSummary;
          if (blank(hw.commProtocols) && protoSummary) patch.commProtocols = protoSummary;
          // OS fields: ALWAYS refresh from audit. These describe what's
          // actually running on the host, and an audit is authoritative for
          // that. A stale "Centos 6.1" left over from a previous OS lie —
          // we'd rather show the real Ubuntu string the scanner observed.
          if (sysinfo.OS) patch.sysSoftwareCategory = String(sysinfo.OS).split(" ")[0];
          if (sysinfo.OSVersion) patch.sysSoftwareVersion = String(sysinfo.OSVersion);
          if (Object.keys(patch).length > 0) {
            await prisma.hardware.update({ where: { id: hw.id }, data: patch });
            autoMapped.hwUpdated = Object.keys(patch).length;
          }
        }
      }

      // Purge previously audit-derived Software on the same target so the
      // inventory reflects the latest audit rather than an ever-growing
      // accumulation of old SBOM entries. We only touch rows that carry a
      // sourceAuditRunId (i.e. auto-registered) — hand-entered Software
      // stays put. The scope is the specific hardware when the upload
      // targeted one, otherwise the whole equipment.
      const replaceScope: Record<string, unknown> = hardwareId
        ? { hardwareId, sourceAuditRunId: { not: null } }
        : { equipmentId, sourceAuditRunId: { not: null } };
      const replaceRes = await prisma.software.deleteMany({ where: replaceScope });
      autoMapped.replaced = replaceRes.count;

      // Track every Software row we create from this audit so we can kick
      // off CVE auto-matching once at the end (rather than per-insert which
      // would hold the connection longer).
      const createdSwIds: string[] = [];

      // Auto-register OS as Software
      if (sysinfo.OS) {
        const osName = String(sysinfo.OS).split(" ").slice(0, 4).join(" ");
        const osSw = await prisma.software.create({
          data: {
            projectId: equipment.projectId,
            equipmentId,
            hardwareId: hardwareId || undefined,
            name: osName,
            version: sysinfo.OSVersion || sysinfo.BuildNumber || null,
            vendor: osName.includes("Windows") ? "Microsoft" : osName.includes("Linux") ? "Linux" : null,
            swType: "OS",
            sourceAuditRunId: run.id,
          },
        });
        createdSwIds.push(osSw.id);
        autoMapped.software++;
      }
      // Auto-register SBOM components
      const sbomRaw = data.SBOM ?? data.sbom;
      if (sbomRaw) {
        const components = (sbomRaw.components ?? sbomRaw) as { name?: string; version?: string; source?: string; type?: string; publisher?: string }[];
        if (Array.isArray(components)) {
          // Dedup by name within this upload so we don't try to create two
          // Software rows with the same name on one HW (e.g. same package
          // reported by pkg-mgr + application probe).
          const seen = new Set<string>();
          for (const comp of components.slice(0, 200)) {
            if (!comp.name) continue;
            const key = comp.name.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            const sw = await prisma.software.create({
              data: {
                projectId: equipment.projectId,
                equipmentId,
                hardwareId: hardwareId || undefined,
                name: comp.name,
                version: comp.version || null,
                vendor: comp.publisher || null,
                swType: (comp.type === "os" || comp.source === "os") ? "OS" : "APPLICATION",
                sourceAuditRunId: run.id,
              },
            });
            createdSwIds.push(sw.id);
            autoMapped.software++;
          }
        }
      }

      // Kick off CVE auto-matching for every software row we just created.
      // Without this the audit's SBOM lands in the inventory but never
      // grows the CVE / risk registers, leaving reviewers with a silent
      // "80 SW, 0 CVE" that looks misleadingly clean. Run in parallel; the
      // matcher swallows its own errors so one bad row never blocks the
      // rest. Full payload can be ~200 rows so we cap concurrency crudely
      // with a simple batching loop.
      const BATCH = 8;
      for (let i = 0; i < createdSwIds.length; i += BATCH) {
        await Promise.all(
          createdSwIds.slice(i, i + BATCH).map((swId) =>
            autoMatchCveForSoftware(swId, equipment.projectId),
          ),
        );
      }
    } catch (mapErr) {
      safeError("Auto-map error (non-fatal)", mapErr);
    }

    // ─── E27 결과 → Assessment 자동 반영 (SC 카테고리 단위) ────────────
    // e27.items의 cat은 "SC-1", "SC-2" 등. 같은 SC의 세부 항목을 종합해서 하나의 Assessment로.
    // 하나라도 fail이면 해당 SC는 FAIL, 모두 pass면 PASS.
    if (hardwareId && e27.items.length > 0) {
      try {
        // SC별 그룹핑
        const scGroups = new Map<string, { items: E27Item[]; allPass: boolean }>();
        for (const item of e27.items) {
          const g = scGroups.get(item.cat) || { items: [], allPass: true };
          g.items.push(item);
          if (!item.pass) g.allPass = false;
          scGroups.set(item.cat, g);
        }

        for (const [sc, group] of scGroups) {
          const passCount = group.items.filter((i) => i.pass).length;
          const totalCount = group.items.length;
          // 전부 통과 → PASS, 전부 실패 → FAIL, 일부만 → PARTIAL
          const result = passCount === totalCount ? "PASS" : passCount === 0 ? "FAIL" : "PARTIAL";
          const evidenceLines = group.items.map((i) => `${i.pass ? "O" : "X"} ${i.item}: ${i.detail}`).join("\n");
          const note = `Auto: ${passCount}/${totalCount} (${detectedPlatform})`;
          // Do NOT use prisma.assessment.upsert here: the soft-delete
          // extension leaves `deletedAt` set on previously-tombstoned rows,
          // so an upsert would happily update a soft-deleted row and leave
          // deletedAt populated, making the new result invisible to
          // `findMany` (which injects deletedAt: null). Instead, reset the
          // row explicitly via updateMany (which targets ANY row matching
          // the composite unique, tombstoned or not) and fall back to
          // create when nothing existed yet.
          const updated = await prisma.assessment.updateMany({
            where: { hardwareId, checkId: sc },
            data: { result, evidence: evidenceLines, note, standard: "E27", deletedAt: null },
          });
          if (updated.count === 0) {
            await prisma.assessment.create({
              data: { hardwareId, checkId: sc, standard: "E27", result, evidence: evidenceLines, note },
            });
          }
        }
      } catch {
        // Non-blocking
      }
    }

    return NextResponse.json({
      id: run.id,
      auditType: "system",
      device: deviceName || sysinfo.ComputerName || "Unknown",
      os: sysinfo.OS ?? "",
      platform: detectedPlatform,
      e27,
      autoMapped,
    });
  } catch (error) {
    safeError("Audit upload error", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiError(`Upload failed: ${message}`, 500);
  }
}

/** GET /api/vendor/audit-tools/upload?equipmentId=xxx — list audit runs for equipment */
/** GET /api/vendor/audit-tools/upload?equipmentId=xxx&runId=yyy — get single run with full SBOM */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { searchParams } = new URL(request.url);
  const equipmentId = searchParams.get("equipmentId");
  const runId = searchParams.get("runId");
  if (!equipmentId) return apiError("equipmentId is required", 400);

  // Get equipment's projectId (vendor sees own, shipyard/admin sees all)
  const eqWhere = user.role === "VENDOR"
    ? {
        id: equipmentId,
        OR: [
          { vendorId: user.id },
          { vendors: { some: { id: user.id } } }
        ]
      }
    : { id: equipmentId };
  const equipment = await prisma.equipment.findFirst({
    where: eqWhere,
    select: { projectId: true },
  });
  if (!equipment) return apiError("Equipment not found", 403);

  // ── Single run with full SBOM ──
  if (runId) {
    const run = await prisma.auditRun.findFirst({
      where: { id: runId, OR: [{ equipmentId }, { projectId: equipment.projectId, equipmentId: null }] },
      select: { id: true, platform: true, results: true, sbomData: true, createdAt: true },
    });
    if (!run) return apiError("Audit run not found", 404);

    const results = typeof run.results === 'string' ? JSON.parse(run.results) as Record<string, unknown> : run.results as Record<string, unknown>;
    const sysinfo = (results?.SystemInfo ?? {}) as Record<string, unknown>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let sbom: any = null;
    if (run.sbomData) {
      try { sbom = JSON.parse(run.sbomData); } catch { sbom = null; }
    }

    return NextResponse.json({
      id: run.id,
      platform: run.platform,
      device: (sysinfo.ComputerName as string) ?? "Unknown",
      os: (sysinfo.OS as string) ?? "",
      createdAt: run.createdAt,
      systemInfo: sysinfo,
      sbom,
    });
  }

  // ── List runs — hardwareId 필터 지원 ──
  const hardwareIdFilter = searchParams.get("hardwareId");

  // When a hardwareId filter is supplied we still anchor the query to the
  // equipment (already authorised above). Earlier the filter was applied
  // standalone, which let a caller supply a hardwareId belonging to a
  // different equipment / project and have the matching runs returned.
  const runsWhere: Record<string, unknown> = hardwareIdFilter
    ? { hardwareId: hardwareIdFilter, equipmentId }
    : { OR: [{ equipmentId }, { projectId: equipment.projectId, equipmentId: null }] };

  const runs = await prisma.auditRun.findMany({
    where: runsWhere,
    orderBy: { createdAt: "desc" },
    select: { id: true, hardwareId: true, platform: true, results: true, sbomData: true, createdAt: true },
  });

  const mapped = runs.map((run) => {
    const results = typeof run.results === 'string' ? JSON.parse(run.results) as Record<string, unknown> | null : run.results as Record<string, unknown> | null;
    const sysinfo = (results?.SystemInfo ?? {}) as Record<string, unknown>;
    const isPLC = results?.audit_type === "plc";

    // Extract SBOM stats without sending full data
    let hasSbom = false;
    let sbomStats: { totalComponents: number; sources: Record<string, number> } | null = null;
    if (run.sbomData) {
      hasSbom = true;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sbom = JSON.parse(run.sbomData) as any;
        const components = sbom?.components ?? [];
        const sources: Record<string, number> = {};
        for (const c of components) {
          const src = c.source || "unknown";
          sources[src] = (sources[src] || 0) + 1;
        }
        sbomStats = { totalComponents: components.length, sources };
      } catch { /* ignore parse errors */ }
    }

    // Re-build E27 results for list view
    let e27: { pass: number; fail: number; total: number; items: E27Item[] } | null = null;
    if (results && !isPLC) {
      try { e27 = buildE27(results); } catch { /* ignore */ }
    } else if (isPLC) {
      const summary = (results?.summary ?? {}) as Record<string, string>;
      const p = parseInt(summary.applied ?? "0");
      const f = parseInt(summary.not_applied ?? "0");
      e27 = { pass: p, fail: f, total: p + f, items: [] };
    }

    return {
      id: run.id,
      // hardwareId needed for AuditRunsList's per-HW grouping — otherwise every
      // run falls into the "equipment-level" bucket even when it was uploaded
      // against a specific device.
      hardwareId: run.hardwareId,
      platform: run.platform,
      device: isPLC ? (results?.device as string) ?? "PLC" : (sysinfo.ComputerName as string) ?? "Unknown",
      os: isPLC ? "PLC" : (sysinfo.OS as string) ?? "",
      createdAt: run.createdAt,
      hasSbom,
      sbomStats,
      e27,
      // Raw parsed payload so AuditResultViewer can render SystemInfo, SBOM,
      // services, ports, patches. Without this the client has to re-fetch per run.
      results,
    };
  });

  // Compute E27 for the latest run and include in response
  let latestE27 = null;
  let latestReport = null;
  if (runs.length > 0) {
    const latestResults = typeof runs[0].results === 'string' ? JSON.parse(runs[0].results) : runs[0].results;
    if (latestResults && latestResults.audit_type !== "plc") {
      const { buildE27: computeE27 } = await import("@/lib/e27-check");
      latestE27 = computeE27(latestResults);
      latestReport = latestResults;
    }
  }

  return NextResponse.json({ runs: mapped, latestE27, latestReport });
}

/** DELETE /api/vendor/audit-tools/upload?runId= — delete audit run */
export async function DELETE(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);
  // Defence-in-depth: SHIPYARD is the read-only viewer role. The later
  // owner check would already reject them (they can't own equipment) but
  // rejecting explicitly makes the intent obvious and keeps the 403 clean.
  if (user.role === "SHIPYARD") return apiError("Read-only role cannot delete audit runs", 403);

  const { searchParams } = new URL(request.url);
  const runId = searchParams.get("runId");
  if (!runId) return apiError("runId is required", 400);

  const run = await prisma.auditRun.findFirst({
    where: { id: runId },
    include: {
      equipment: {
        select: {
          vendorId: true,
          vendors: { select: { id: true } }
        }
      }
    },
  });

  if (!run) return apiError("Audit run not found", 404);
  const isOwner = run.equipment?.vendorId === user.id || run.equipment?.vendors.some(v => v.id === user.id);
  if (user.role !== "ADMIN" && !isOwner) {
    return apiError("Forbidden", 403);
  }

  await prisma.auditRun.delete({ where: { id: runId } });
  return NextResponse.json({ success: true });
}
