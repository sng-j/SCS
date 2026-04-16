import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, apiError } from "@/lib/auth-helpers";
import crypto from "crypto";

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

// ─── Build E27 check results (matches v12 build_e27) ────────────────────────
interface E27Item {
  cat: string;
  item: string;
  detail: string;
  pass: boolean;
}

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

  // SC-1 Password
  chk(ap.PasswordComplexity === "Enabled", "SC-1 Password", "Complexity requirement", ap.PasswordComplexity ?? "N/A");
  chk(parseInt(ap.MinPwdLen ?? "0") >= 8, "SC-1 Password", "Min length >= 8", `${ap.MinPwdLen ?? "N/A"} chars`);
  chk(parseInt(ap.MaxPwdAge ?? "999") <= 90, "SC-1 Password", "Max age <= 90 days", `${ap.MaxPwdAge ?? "N/A"} days`);
  const lt = parseInt(ap.LockoutThreshold ?? "0");
  chk(lt > 0 && lt <= 10, "SC-1 Password", "Lockout threshold <= 10", `${ap.LockoutThreshold ?? "N/A"} attempts`);

  // SC-2 Account
  const ge = la.GuestEnabled;
  chk(ge === false || ge === "False" || ge === "0" || ge === 0, "SC-2 Account", "Guest account disabled", ge === false ? "Disabled" : String(ge ?? "N/A"));

  // SC-5 Network
  chk(!!net.SMBv1Disabled, "SC-5 Network", "SMBv1 disabled", net.SMBv1Disabled ? "Disabled" : "Enabled");
  chk(parseInt(usb.AutoRunDisabled ?? "0") > 0, "SC-5 Network", "AutoRun disabled", String(usb.AutoRunDisabled ?? "N/A"));

  // SC-6 RDP
  chk(!!rdp.NLARequired, "SC-6 RDP", "NLA authentication required", rdp.NLARequired ? "Required" : "Not Required");
  chk(parseInt(rdp.EncryptionLevel ?? "0") >= 3, "SC-6 RDP", "Encryption level >= 3", String(rdp.EncryptionLevel ?? "N/A"));

  // SC-7 Audit
  let hasLogon = false;
  let hasProc = false;
  for (const [k, v] of Object.entries(aud)) {
    if (/logon/i.test(k) && v !== "No Auditing") hasLogon = true;
    if (/process/i.test(k) && v !== "No Auditing") hasProc = true;
  }
  chk(hasLogon, "SC-7 Audit", "Logon auditing enabled", hasLogon ? "Enabled" : "No Auditing");
  chk(hasProc, "SC-7 Audit", "Process auditing enabled", hasProc ? "Enabled" : "No Auditing");

  // SC-10 ScreenLock
  chk(sl.ScreenSaverEnabled === "1", "SC-10 ScreenLock", "Screen saver enabled", String(sl.ScreenSaverEnabled ?? "0"));
  chk(sl.ScreenSaverSecure === "1", "SC-10 ScreenLock", "Password on resume required", String(sl.ScreenSaverSecure ?? "0"));
  chk(parseInt(sl.ScreenSaverTimeout ?? "9999") <= 600, "SC-10 ScreenLock", "Timeout <= 600 sec", `${sl.ScreenSaverTimeout ?? "N/A"} sec`);

  // SC-11 Antivirus
  chk(!!av.Enabled, "SC-11 AV", "Defender enabled", av.Enabled ? "Enabled" : "Disabled");
  chk(!!av.RealTimeProtection, "SC-11 AV", "Real-time protection", av.RealTimeProtection ? "Enabled" : "Disabled");
  chk(parseInt(av.SignatureAge_Days ?? "999") <= 7, "SC-11 AV", "Signature age <= 7 days", `${av.SignatureAge_Days ?? "N/A"} days`);

  // SC-13 Patch
  chk(!(pat.AutoUpdateOff ?? true), "SC-13 Patch", "Auto-update enabled", (pat.AutoUpdateOff ?? true) ? "Off" : "On");

  const passCount = items.filter((i) => i.pass).length;
  return { pass: passCount, fail: items.length - passCount, total: items.length, items };
}

/** POST /api/admin/audit-tools/decrypt — decrypt an encrypted audit result file */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);
  if (user.role !== "ADMIN") return apiError("Forbidden", 403);

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const pin = formData.get("pin") as string | null;
    const projectId = formData.get("projectId") as string | null;

    if (!file) return apiError("file is required", 400);
    if (!pin) return apiError("pin is required", 400);

    const fileRaw = Buffer.from(await file.arrayBuffer()).toString("ascii").trim();
    const garbageInterval = (parseInt(pin) % 13) + 5;

    // ─── Auto-detect format ──────────────────────────────────────────
    let json: string | null = null;
    let salt: Buffer | null = null;
    let iv: Buffer | null = null;
    let cipher: Buffer | null = null;

    const tryRaw = Buffer.from(fileRaw, "base64");

    // [A] SCSDAT2: base64(SCSDAT2 + gi_byte + salt16 + iv16 + garbage_cipher)
    if (tryRaw.length > 40 && tryRaw.subarray(0, 7).toString("ascii") === "SCSDAT2") {
      const gi = tryRaw[7];
      salt = tryRaw.subarray(8, 24);
      iv = tryRaw.subarray(24, 40);
      cipher = stripGarbage(tryRaw.subarray(40), gi);

    // [B] SCSAUDIT1: base64(SCSAUDIT1 + salt16 + iv16 + cipher)
    } else if (tryRaw.length > 41 && tryRaw.subarray(0, 9).toString("ascii") === "SCSAUDIT1") {
      salt = tryRaw.subarray(9, 25);
      iv = tryRaw.subarray(25, 41);
      cipher = tryRaw.subarray(41);

    // [C] Plaintext fallback: base64(plain JSON)
    } else {
      try {
        const plainText = tryRaw.toString("utf-8");
        JSON.parse(plainText);
        json = plainText;
      } catch {
        return apiError("Invalid file format: unrecognized encryption header", 400);
      }
    }

    // ─── AES-256-CBC decrypt ──────────────────────────────────────────
    if (json === null && salt && iv && cipher) {
      const key = crypto.pbkdf2Sync(pin, salt, 100000, 32, "sha256");
      try {
        const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
        json = Buffer.concat([decipher.update(cipher), decipher.final()]).toString("utf-8");
      } catch {
        return apiError("Decryption failed (wrong PIN?)", 400);
      }
    }

    if (!json) {
      return apiError("Decryption produced empty result", 400);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: any;
    try {
      data = JSON.parse(json);
    } catch {
      return apiError("Decrypted content is not valid JSON", 400);
    }

    // ─── PLC audit type ──────────────────────────────────────────────
    if (data.audit_type === "plc") {
      const summary = data.summary ?? {};
      const passCount = parseInt(summary.applied ?? "0");
      const failCount = parseInt(summary.not_applied ?? "0");

      if (projectId) {
        await prisma.auditRun.create({
          data: {
            projectId,
            platform: "PLC",
            results: JSON.stringify(data),
            sbomData: undefined,
          },
        });
      }

      return NextResponse.json({
        success: true,
        auditType: "plc",
        device: data.device ?? "PLC",
        runDate: data.audit_time ?? new Date().toISOString(),
        e27: { pass: passCount, fail: failCount, total: passCount + failCount, items: [] },
        data,
      });
    }

    // ─── Windows/Linux audit ──────────────────────────────────────────
    const sysinfo = data.SystemInfo ?? {};
    const e27 = buildE27(data);

    // Save to DB if projectId provided
    if (projectId) {
      await prisma.auditRun.create({
        data: {
          projectId,
          platform: sysinfo.OS?.includes("Linux") ? "LINUX" : "WINDOWS",
          results: JSON.stringify(data),
          sbomData: data.SBOM || data.sbom ? JSON.stringify(data.SBOM ?? data.sbom) : null,
        },
      });
    }

    return NextResponse.json({
      success: true,
      auditType: "system",
      device: sysinfo.ComputerName ?? "Unknown",
      os: sysinfo.OS ?? "",
      runDate: sysinfo.AuditTime ?? new Date().toISOString(),
      e27,
      data,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Decryption failed";
    return apiError(`Decryption failed: ${message}`, 400);
  }
}
