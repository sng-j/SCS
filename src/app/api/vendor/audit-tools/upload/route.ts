import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getSessionUser, apiError } from "@/lib/auth-helpers";
import { safeError } from "@/lib/safe-log";
import { deriveAuditPin } from "@/lib/audit-pin";

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

// ─── Build E27 check results ────────────────────────────────────────────────
interface E27Item { cat: string; item: string; detail: string; pass: boolean }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildE27(data: any): { pass: number; fail: number; total: number; items: E27Item[] } {
  const items: E27Item[] = [];
  const ap = data.AccountPolicy ?? {};
  const la = data.LocalAccounts ?? {};
  const net = data.NetworkSettings ?? {};
  const usb = data.USBPolicy ?? {};
  const rdp = data.RDP ?? {};
  const aud = data.AuditPolicy ?? {};
  const sl = data.ScreenLock ?? {};
  const av = data.Antivirus?.WindowsDefender ?? data.Antivirus ?? {};
  const pat = data.PatchStatus ?? {};

  const chk = (pass: boolean, cat: string, item: string, detail: string) => {
    items.push({ cat, item, detail: String(detail), pass });
  };

  chk(ap.PasswordComplexity === "Enabled", "SC-1", "Password Complexity", ap.PasswordComplexity ?? "N/A");
  chk(parseInt(ap.MinPwdLen ?? "0") >= 8, "SC-1", "Min Length >= 8", `${ap.MinPwdLen ?? "N/A"}`);
  chk(parseInt(ap.MaxPwdAge ?? "999") <= 90, "SC-1", "Max Age <= 90d", `${ap.MaxPwdAge ?? "N/A"}`);
  const lt = parseInt(ap.LockoutThreshold ?? "0");
  chk(lt > 0 && lt <= 10, "SC-1", "Lockout Threshold", `${ap.LockoutThreshold ?? "N/A"}`);

  const ge = la.GuestEnabled;
  chk(ge === false || ge === "False" || ge === "0" || ge === 0, "SC-2", "Guest Disabled", String(ge ?? "N/A"));

  chk(!!net.SMBv1Disabled, "SC-5", "SMBv1 Disabled", net.SMBv1Disabled ? "Yes" : "No");
  chk(parseInt(usb.AutoRunDisabled ?? "0") > 0, "SC-5", "AutoRun Disabled", String(usb.AutoRunDisabled ?? "N/A"));

  chk(!!rdp.NLARequired, "SC-6", "NLA Required", rdp.NLARequired ? "Yes" : "No");
  chk(parseInt(rdp.EncryptionLevel ?? "0") >= 3, "SC-6", "RDP Encryption >= 3", String(rdp.EncryptionLevel ?? "N/A"));

  let hasLogon = false, hasProc = false;
  for (const [k, v] of Object.entries(aud)) {
    if (/logon/i.test(k) && v !== "No Auditing") hasLogon = true;
    if (/process/i.test(k) && v !== "No Auditing") hasProc = true;
  }
  chk(hasLogon, "SC-7", "Logon Auditing", hasLogon ? "Enabled" : "No");
  chk(hasProc, "SC-7", "Process Auditing", hasProc ? "Enabled" : "No");

  chk(sl.ScreenSaverEnabled === "1", "SC-10", "Screen Saver", String(sl.ScreenSaverEnabled ?? "0"));
  chk(sl.ScreenSaverSecure === "1", "SC-10", "Password on Resume", String(sl.ScreenSaverSecure ?? "0"));
  chk(parseInt(sl.ScreenSaverTimeout ?? "9999") <= 600, "SC-10", "Timeout <= 600s", `${sl.ScreenSaverTimeout ?? "N/A"}`);

  chk(!!av.Enabled, "SC-11", "AV Enabled", av.Enabled ? "Yes" : "No");
  chk(!!av.RealTimeProtection, "SC-11", "Real-time Protection", av.RealTimeProtection ? "Yes" : "No");
  chk(parseInt(av.SignatureAge_Days ?? "999") <= 7, "SC-11", "Signature <= 7d", `${av.SignatureAge_Days ?? "N/A"}`);

  chk(!(pat.AutoUpdateOff ?? true), "SC-13", "Auto-update", (pat.AutoUpdateOff ?? true) ? "Off" : "On");

  const passCount = items.filter((i) => i.pass).length;
  return { pass: passCount, fail: items.length - passCount, total: items.length, items };
}

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
    const autoMapped = { hardware: 0, software: 0 };
    try {
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
          },
        });
        autoMapped.hardware++;
      }

      // Auto-register OS as Software — hardwareId 단위 중복 체크
      if (sysinfo.OS) {
        const osName = String(sysinfo.OS).split(" ").slice(0, 4).join(" ");
        const osWhere: Record<string, unknown> = hardwareId
          ? { hardwareId, swType: "OS" }
          : { equipmentId, name: { contains: osName.split(" ").slice(0, 2).join(" ") } };
        const existing = await prisma.software.findFirst({ where: osWhere });
        if (!existing) {
          await prisma.software.create({
            data: {
              projectId: equipment.projectId,
              equipmentId,
              hardwareId: hardwareId || undefined,
              name: osName,
              version: sysinfo.OSVersion || sysinfo.BuildNumber || null,
              vendor: osName.includes("Windows") ? "Microsoft" : osName.includes("Linux") ? "Linux" : null,
              swType: "OS",
            },
          });
          autoMapped.software++;
        }
      }
      // Auto-register SBOM components — hardwareId 단위 중복 체크
      const sbomRaw = data.SBOM ?? data.sbom;
      if (sbomRaw) {
        const components = (sbomRaw.components ?? sbomRaw) as { name?: string; version?: string; source?: string; type?: string }[];
        if (Array.isArray(components)) {
          for (const comp of components.slice(0, 200)) {
            if (!comp.name) continue;
            const swWhere: Record<string, unknown> = hardwareId
              ? { hardwareId, name: comp.name }
              : { equipmentId, name: comp.name };
            const exists = await prisma.software.findFirst({ where: swWhere });
            if (!exists) {
              await prisma.software.create({
                data: {
                  projectId: equipment.projectId,
                  equipmentId,
                  hardwareId: hardwareId || undefined,
                  name: comp.name,
                  version: comp.version || null,
                  swType: (comp.type === "os" || comp.source === "os") ? "OS" : "APPLICATION",
                },
              });
              autoMapped.software++;
            }
          }
        }
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
          await prisma.assessment.upsert({
            where: { hardwareId_checkId: { hardwareId, checkId: sc } },
            create: {
              hardwareId,
              checkId: sc,
              standard: "E27",
              result,
              evidence: evidenceLines,
              note: `Auto: ${passCount}/${totalCount} (${detectedPlatform})`,
            },
            update: {
              result,
              evidence: evidenceLines,
              note: `Auto: ${passCount}/${totalCount} (${detectedPlatform})`,
            },
          });
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

  const runsWhere: Record<string, unknown> = hardwareIdFilter
    ? { hardwareId: hardwareIdFilter }  // 특정 장치의 결과만
    : { OR: [{ equipmentId }, { projectId: equipment.projectId, equipmentId: null }] };  // 전체

  const runs = await prisma.auditRun.findMany({
    where: runsWhere,
    orderBy: { createdAt: "desc" },
    select: { id: true, platform: true, results: true, sbomData: true, createdAt: true },
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
      platform: run.platform,
      device: isPLC ? (results?.device as string) ?? "PLC" : (sysinfo.ComputerName as string) ?? "Unknown",
      os: isPLC ? "PLC" : (sysinfo.OS as string) ?? "",
      createdAt: run.createdAt,
      hasSbom,
      sbomStats,
      e27,
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
