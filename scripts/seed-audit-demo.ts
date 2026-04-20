/**
 * Insert demo AuditRun records for the T-2025-001 project so the Audit tab
 * has realistic content: one Windows server audit (mixed pass/fail) and one
 * PLC audit. Temperature Sensor intentionally left without a run so the
 * coverage bar shows partial completion.
 *
 * Safe to re-run — deletes any prior demo runs keyed on the `demo: true`
 * marker embedded in the results payload.
 */
import { prisma } from "../src/lib/prisma";

const PROJECT_ID = "cmo0rn3oe0007mfxhq6ss4dik";
const EQUIPMENT_ID = "cmo0rn3oj000bmfxhkr8pv1vb"; // IAS
const HW_IAS_SERVER = "cmo0rn3or000jmfxhjdpokkvw";
const HW_IAS_PLC = "cmo0rn3ot000lmfxhzmx8xzsl";

// ─── Windows Server audit — realistic mixed result ──────────────────────────
const windowsAudit = {
  demo: true,
  SystemInfo: {
    ComputerName: "IAS-SRV-01",
    OS: "Microsoft Windows Server 2019 Standard",
    OSBuild: "17763.5936",
    Architecture: "x64",
    Manufacturer: "Dell Inc.",
    Model: "PowerEdge R640",
    TotalRAM_GB: "32",
    Domain: "WORKGROUP",
    LastBoot: "2026-04-18 03:12:47",
    AuditTime: "2026-04-20 09:30:15",
    Platform: "windows",
  },
  AccountPolicy: {
    PasswordComplexity: "Enabled",
    MinPwdLen: "10",
    MaxPwdAge: "90",
    MinPwdAge: "1",
    LockoutThreshold: "5",
    LockoutDuration: "30",
  },
  LocalAccounts: {
    GuestEnabled: false,
    AdministratorEnabled: true,
    Users: ["Administrator", "ias-operator", "vendor-svc"],
  },
  NetworkSettings: {
    SMBv1Disabled: true,
    LMAuthLevel: 5,
    NullSessionBlocked: true,
    RestrictAnonymous: 2,
  },
  USBPolicy: {
    AutoRunDisabled: "255",
    RemovableStorageAccess: "Denied",
  },
  RDP: {
    Enabled: true,
    NLARequired: true,
    EncryptionLevel: "3",
    MinEncryption: "High",
  },
  AuditPolicy: {
    "Logon Events": "Success, Failure",
    "Account Management": "Success, Failure",
    "Process Tracking": "No Auditing",
    "Policy Change": "Success",
    "Object Access": "No Auditing",
  },
  ScreenLock: {
    ScreenSaverEnabled: "1",
    ScreenSaverSecure: "1",
    ScreenSaverTimeout: "900", // 15 min — just over the 10 min threshold → FAIL
  },
  Antivirus: {
    WindowsDefender: {
      Enabled: true,
      RealTimeProtection: true,
      SignatureAge_Days: "3",
      LastScan: "2026-04-19",
    },
  },
  PatchStatus: {
    AutoUpdateOff: false,
    TotalInstalled: 187,
    LastPatch: "2026-04-10",
    RecentPatches: [
      { HotFixID: "KB5036892", Description: "Security Update", InstalledOn: "2026-04-10" },
      { HotFixID: "KB5035849", Description: "Cumulative Update", InstalledOn: "2026-03-12" },
      { HotFixID: "KB5035857", Description: "Servicing Stack Update", InstalledOn: "2026-03-12" },
      { HotFixID: "KB5034439", Description: ".NET Framework Update", InstalledOn: "2026-02-13" },
    ],
  },
  InstalledSoftware: [
    { Name: "Microsoft Windows Server 2019", Version: "10.0.17763", Publisher: "Microsoft Corporation" },
    { Name: "MT-700 Runtime", Version: "7.5.2", Publisher: "TestMarine" },
    { Name: ".NET Framework 4.8", Version: "4.8.03761", Publisher: "Microsoft Corporation" },
    { Name: "OpenSSL", Version: "3.0.12", Publisher: "OpenSSL Project" },
    { Name: "Python 3.11", Version: "3.11.7", Publisher: "Python Software Foundation" },
    { Name: "7-Zip", Version: "23.01", Publisher: "Igor Pavlov" },
    { Name: "Notepad++", Version: "8.6.0", Publisher: "Notepad++ Team" },
  ],
  RunningServices: [
    { Name: "LanmanServer", DisplayName: "Server", StartType: "Auto" },
    { Name: "EventLog", DisplayName: "Windows Event Log", StartType: "Auto" },
    { Name: "Schedule", DisplayName: "Task Scheduler", StartType: "Auto" },
    { Name: "Dnscache", DisplayName: "DNS Client", StartType: "Auto" },
    { Name: "MpsSvc", DisplayName: "Windows Firewall", StartType: "Auto" },
    { Name: "WinDefend", DisplayName: "Microsoft Defender Antivirus", StartType: "Auto" },
    { Name: "TermService", DisplayName: "Remote Desktop Services", StartType: "Manual" },
    { Name: "W3SVC", DisplayName: "World Wide Web Publishing", StartType: "Auto" },
    { Name: "Spooler", DisplayName: "Print Spooler", StartType: "Auto" },
    { Name: "MT700-Engine", DisplayName: "MT-700 Control Engine", StartType: "Auto" },
  ],
  OpenPorts: [
    { Port: 22, IP: "0.0.0.0", Process: "sshd.exe", PID: "1284" },
    { Port: 135, IP: "0.0.0.0", Process: "svchost.exe", PID: "892" },
    { Port: 445, IP: "0.0.0.0", Process: "System", PID: "4" },
    { Port: 3389, IP: "0.0.0.0", Process: "svchost.exe", PID: "1692" },
    { Port: 5985, IP: "0.0.0.0", Process: "System", PID: "4" },
    { Port: 8080, IP: "127.0.0.1", Process: "MT700-Engine.exe", PID: "3124" },
    { Port: 47808, IP: "0.0.0.0", Process: "MT700-Engine.exe", PID: "3124" },
  ],
  SBOM: {
    components: [
      { name: "Microsoft Windows Server 2019", version: "10.0.17763", source: "os" },
      { name: "MT-700 Runtime", version: "7.5.2", source: "app" },
      { name: ".NET Framework", version: "4.8.03761", source: "runtime" },
      { name: "OpenSSL", version: "3.0.12", source: "lib" },
      { name: "Python", version: "3.11.7", source: "runtime" },
    ],
  },
};

// ─── PLC audit — simplified format ──────────────────────────────────────────
const plcAudit = {
  demo: true,
  audit_type: "plc",
  device: "IAS-PLC-01",
  vendor: "TestMarine",
  model: "MT-PLC Module",
  firmware: "2.1.0",
  ip: "192.168.2.20",
  protocol: "Modbus TCP",
  audited_at: "2026-04-20 09:45:22",
  summary: { applied: "18", not_applied: "6" },
  checks: [
    { id: "PLC-1", item: "Default credentials changed", pass: true },
    { id: "PLC-2", item: "Firmware up-to-date", pass: true },
    { id: "PLC-3", item: "Program memory write-protected", pass: true },
    { id: "PLC-4", item: "Remote programming disabled", pass: false, note: "Enabled on port 102" },
    { id: "PLC-5", item: "Network segmentation (VLAN)", pass: true },
    { id: "PLC-6", item: "Physical key-switch in RUN", pass: true },
    { id: "PLC-7", item: "Syslog forwarding configured", pass: false, note: "No SIEM integration" },
    { id: "PLC-8", item: "Backup configuration stored offline", pass: true },
  ],
};

async function main() {
  // Clear any prior demo runs for this project so the script is idempotent
  const deleted = await prisma.auditRun.deleteMany({
    where: {
      projectId: PROJECT_ID,
      results: { contains: '"demo":true' },
    },
  });
  if (deleted.count > 0) console.log(`[seed-audit] cleared ${deleted.count} prior demo run(s)`);

  // Windows server run → attached to IAS Server
  const winRun = await prisma.auditRun.create({
    data: {
      projectId: PROJECT_ID,
      equipmentId: EQUIPMENT_ID,
      hardwareId: HW_IAS_SERVER,
      platform: "WINDOWS",
      results: JSON.stringify(windowsAudit),
      sbomData: JSON.stringify(windowsAudit.SBOM),
    },
  });
  console.log(`[seed-audit] created Windows run ${winRun.id} → IAS Server`);

  // PLC run → attached to IAS PLC
  const plcRun = await prisma.auditRun.create({
    data: {
      projectId: PROJECT_ID,
      equipmentId: EQUIPMENT_ID,
      hardwareId: HW_IAS_PLC,
      platform: "PLC",
      results: JSON.stringify(plcAudit),
      sbomData: null,
    },
  });
  console.log(`[seed-audit] created PLC run ${plcRun.id} → IAS PLC`);

  console.log("\n[seed-audit] coverage: 2/3 HW audited (Temperature Sensor intentionally left)");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
