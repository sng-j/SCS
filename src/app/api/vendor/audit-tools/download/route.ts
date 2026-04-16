import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import crypto from "crypto";
import archiver from "archiver";
import { PassThrough } from "stream";
import { prisma } from "@/lib/prisma";
import { getSessionUser, apiError } from "@/lib/auth-helpers";
import { safeError } from "@/lib/safe-log";
import { deriveAuditPin } from "@/lib/audit-pin";

export const dynamic = "force-dynamic";

const AUDIT_SRC = path.join(process.cwd(), "src", "data", "audit-tools");

// ─── Garbage interleave (matches PHP insert_garbage) ───────────────────────
function insertGarbage(data: Buffer, interval: number): Buffer {
  const out: number[] = [];
  for (let i = 0; i < data.length; i++) {
    out.push(data[i]);
    if ((i + 1) % interval === 0) {
      out.push(crypto.randomInt(0, 256));
    }
  }
  return Buffer.from(out);
}

// ─── Build Windows extract.ps1 ────────────────────────────────────────────
const EXTRACT_PS1 = `$inp = "$env:TEMP\\scs_in.dat"
$out_file = "$env:TEMP\\scs_run.ps1"
$bytes = [IO.File]::ReadAllBytes($inp)
$iv = [int]$bytes[2]
$out = New-Object System.Collections.Generic.List[byte]
for($i=4; $i -lt $bytes.Length; $i++) {
    if(($i-4) % ($iv+1) -ne $iv) {
        $out.Add($bytes[$i])
    }
}
[IO.File]::WriteAllBytes($out_file, $out.ToArray())
`;

// ─── Build Windows Run_Audit.bat ──────────────────────────────────────────
const RUN_AUDIT_BAT = `@echo off
cd /d "%~dp0"
copy /y SCS_PC.dat "%TEMP%\\scs_in.dat" >nul
copy /y extract.ps1 "%TEMP%\\scs_ex.ps1" >nul
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%TEMP%\\scs_ex.ps1"
powershell.exe -NoProfile -Sta -ExecutionPolicy Bypass -File "%TEMP%\\scs_run.ps1"
del /q "%TEMP%\\scs_in.dat" "%TEMP%\\scs_ex.ps1" "%TEMP%\\scs_run.ps1" 2>nul
`;

/** GET /api/vendor/audit-tools/download?equipmentId=xxx&platform=windows|linux */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { searchParams } = new URL(request.url);
  const equipmentId = searchParams.get("equipmentId");
  const platform = searchParams.get("platform"); // "windows" or "linux"

  if (!equipmentId) return apiError("equipmentId is required", 400);
  if (!platform || !["windows", "linux"].includes(platform)) {
    return apiError("platform must be 'windows' or 'linux'", 400);
  }

  // Verify vendor owns this equipment
  const equipment = await prisma.equipment.findFirst({
    where: {
      id: equipmentId,
      OR: [
        { vendorId: user.id },
        { vendors: { some: { id: user.id } } }
      ]
    },
    select: { id: true, name: true, projectId: true, certificationInfo: true },
  });
  if (!equipment) return apiError("Equipment not found or access denied", 403);

  // Derive PIN deterministically from AUTH_SECRET + equipmentId — never persisted.
  const pin = deriveAuditPin(equipmentId);

  // One-time migration: strip any legacy plaintext auditPin from certificationInfo.
  if (equipment.certificationInfo) {
    try {
      const certInfo = JSON.parse(equipment.certificationInfo as string) as Record<string, unknown>;
      if ("auditPin" in certInfo) {
        delete certInfo.auditPin;
        await prisma.equipment.update({
          where: { id: equipmentId },
          data: { certificationInfo: JSON.stringify(certInfo) },
        });
      }
    } catch {
      // Malformed JSON — leave as-is; not our concern here.
    }
  }

  const gi = (parseInt(pin, 16) % 13) + 5;

  try {
    let response: NextResponse;
    if (platform === "windows") {
      response = await buildWindowsZip(pin, gi, equipment.name);
    } else {
      response = await buildLinuxZip(pin, gi, equipment.name);
    }
    // Return PIN in JSON body via a separate endpoint instead of HTTP headers
    // PIN is stored in equipment.certificationInfo and retrieved separately
    return response;
  } catch (error) {
    safeError("Audit tool build error", error);
    return apiError("Failed to build audit tool", 500);
  }
}

// ─── Windows ZIP builder ──────────────────────────────────────────────────
async function buildWindowsZip(pin: string, gi: number, eqName: string): Promise<NextResponse> {
  const ps1Source = await readFile(path.join(AUDIT_SRC, "_source_clean.ps1"), "utf-8");

  // Inject _AK and _GI at the top of the PS1 script
  const ps1Content = `$global:_AK='${pin}'\r\n$global:_GI=${gi}\r\n${ps1Source}`;
  const ps1Buffer = Buffer.from(ps1Content, "utf-8");

  // Create garbage-interleaved dat file
  const garbageData = insertGarbage(ps1Buffer, gi);

  // Build SCS_PC.dat: magic header + garbage-interleaved content
  const header = Buffer.from([0xda, 0x7a, gi, 0x00]);
  const datContent = Buffer.concat([header, garbageData]);

  // Create ZIP archive
  const archive = archiver("zip", { zlib: { level: 9 } });
  const passThrough = new PassThrough();
  archive.pipe(passThrough);

  archive.append(RUN_AUDIT_BAT, { name: "Run_Audit.bat" });
  archive.append(EXTRACT_PS1, { name: "extract.ps1" });
  archive.append(datContent, { name: "SCS_PC.dat" });

  await archive.finalize();

  const chunks: Buffer[] = [];
  for await (const chunk of passThrough) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const zipBuffer = Buffer.concat(chunks);

  const asciiName = eqName.replace(/[^a-zA-Z0-9_-]/g, "").substring(0, 30) || "Equipment";
  const utfName = encodeURIComponent(`SCS_Audit_Windows_${eqName.replace(/[/\\:*?"<>|]/g, "_").substring(0, 30)}.zip`);
  return new NextResponse(zipBuffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="SCS_Audit_Windows_${asciiName}.zip"; filename*=UTF-8''${utfName}`,
      "Content-Length": String(zipBuffer.length),
    },
  });
}

// ─── Linux ZIP builder ────────────────────────────────────────────────────
async function buildLinuxZip(pin: string, gi: number, eqName: string): Promise<NextResponse> {
  const [pySource, shSource] = await Promise.all([
    readFile(path.join(AUDIT_SRC, "linux_audit.py"), "utf-8"),
    readFile(path.join(AUDIT_SRC, "run_linux_audit.sh"), "utf-8"),
  ]);

  // Inject _AK and _GI into Python source
  let pyInjected = pySource.replace(/^_AK\s*=\s*"[^"]*"/m, `_AK = "${pin}"`);
  pyInjected = pyInjected.replace(/^_GI\s*=\s*\d+/m, `_GI = ${gi}`);

  // Create ZIP archive
  const archive = archiver("zip", { zlib: { level: 9 } });
  const passThrough = new PassThrough();
  archive.pipe(passThrough);

  archive.append(pyInjected, { name: "linux_audit.py" });
  archive.append(shSource, { name: "run_linux_audit.sh", mode: 0o755 });

  await archive.finalize();

  const chunks: Buffer[] = [];
  for await (const chunk of passThrough) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const zipBuffer = Buffer.concat(chunks);

  const asciiName = eqName.replace(/[^a-zA-Z0-9_-]/g, "").substring(0, 30) || "Equipment";
  const utfName = encodeURIComponent(`SCS_Audit_Linux_${eqName.replace(/[/\\:*?"<>|]/g, "_").substring(0, 30)}.zip`);
  return new NextResponse(zipBuffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="SCS_Audit_Linux_${asciiName}.zip"; filename*=UTF-8''${utfName}`,
      "Content-Length": String(zipBuffer.length),
    },
  });
}
