import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, verifyProjectAccess, apiError } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ projectId: string; documentId: string }>;
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface HwItem {
  id: string;
  name: string;
  type: string;
  manufacturer: string | null;
  model: string | null;
  ipAddress: string | null;
  macAddress: string | null;
  zone: string | null;
  location: string | null;
  software: { id: string; name: string; version: string | null }[];
}

interface SwItem {
  id: string;
  name: string;
  version: string | null;
  vendor: string | null;
  swType: string;
  cpe: string | null;
  hardware: { id: string; name: string } | null;
  _count: { cveMatches: number };
}

interface AssItem {
  checkId: string;
  result: string;
  evidence: string | null;
  note: string | null;
  hardwareId: string;
  hardware: { id: string; name: string; type: string };
}

interface ProjectCtx {
  vesselName: string;
  shipowner: string | null;
  classification: string | null;
  systemName: string | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function badge(result: string): string {
  const c: Record<string, string> = {
    PASS: "background:#d4edda;color:#155724",
    FAIL: "background:#f8d7da;color:#721c24",
    PARTIAL: "background:#fff3cd;color:#856404",
    NOT_APPLICABLE: "background:#e2e3e5;color:#383d41",
    NOT_CHECKED: "background:#f5f5f5;color:#6c757d",
  };
  return `<span style="padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600;${c[result] || c.NOT_CHECKED}">${esc(result.replace("_", " "))}</span>`;
}

function table(headers: string[], rows: string[][]): string {
  const th = headers.map((h) => `<th>${esc(h)}</th>`).join("");
  const trs = rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("");
  return `<table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`;
}

function countMap<T>(items: T[], key: (item: T) => string): Map<string, number> {
  const m = new Map<string, number>();
  for (const item of items) {
    const k = key(item) || "Other";
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item) || "Unassigned";
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(item);
  }
  return m;
}

function section(title: string, body: string, bullets?: string[]): string {
  let html = `<h2>${esc(title)}</h2><p>${esc(body)}</p>`;
  if (bullets && bullets.length > 0) {
    html += `<ul>${bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>`;
  }
  return html;
}

// ─── Type-specific preview builders ─────────────────────────────────────────

function previewCBS(hw: HwItem[]): string {
  let html = section(
    "1. Overview",
    `This document describes the Computer Based System (CBS) hardware asset inventory. Total: ${hw.length} hardware asset(s).`,
  );

  // Hardware table
  html += `<h2>2. Hardware Asset Inventory</h2>`;
  html += table(
    ["#", "Asset Name", "Type", "Manufacturer", "Model", "IP Address", "Zone", "Location", "SW Count"],
    hw.map((h, i) => [
      String(i + 1), esc(h.name), esc(h.type), esc(h.manufacturer || "—"), esc(h.model || "—"),
      esc(h.ipAddress || "—"), esc(h.zone || "—"), esc(h.location || "—"), String(h.software.length),
    ]),
  );

  // Zone distribution
  const zones = countMap(hw, (h) => h.zone || "Unassigned");
  html += `<h3>2.1 Zone Distribution</h3>`;
  html += table(["Zone", "Asset Count"], [...zones.entries()].map(([z, c]) => [esc(z), String(c)]));

  // Type distribution
  const types = countMap(hw, (h) => h.type);
  html += `<h3>2.2 Asset Type Distribution</h3>`;
  html += table(["Type", "Count"], [...types.entries()].map(([t, c]) => [esc(t), String(c)]));

  return html;
}

function previewSBOM(sw: SwItem[]): string {
  let html = section(
    "1. Overview",
    `This document describes the Software Bill of Materials (SBOM) for the CBS. Total: ${sw.length} software component(s).`,
  );

  html += `<h2>2. Software Inventory</h2>`;
  html += table(
    ["#", "Software Name", "Version", "Vendor", "Type", "CPE", "Installed On"],
    sw.map((s, i) => [
      String(i + 1), esc(s.name), esc(s.version || "—"), esc(s.vendor || "—"),
      esc(s.swType), esc(s.cpe || "Not registered"), esc(s.hardware?.name || "—"),
    ]),
  );

  const types = countMap(sw, (s) => s.swType);
  html += `<h3>2.1 Software Type Distribution</h3>`;
  html += table(["Type", "Count"], [...types.entries()].map(([t, c]) => [esc(t), String(c)]));

  const vendors = countMap(sw, (s) => s.vendor || "Unknown");
  html += `<h3>2.2 Vendor Summary</h3>`;
  html += table(["Vendor", "Software Count"], [...vendors.entries()].map(([v, c]) => [esc(v), String(c)]));

  return html;
}

function previewAUD(hw: HwItem[], assessments: AssItem[]): string {
  const pass = assessments.filter((a) => a.result === "PASS").length;
  const fail = assessments.filter((a) => a.result === "FAIL").length;
  const partial = assessments.filter((a) => a.result === "PARTIAL").length;
  const na = assessments.filter((a) => a.result === "NOT_APPLICABLE").length;
  const total = assessments.length;
  const rate = total > 0 ? Math.round((pass / total) * 100) : 0;

  let html = section(
    "1. Executive Summary",
    `Security configuration assessment performed on ${hw.length} hardware asset(s) with ${total} total checks. Overall compliance rate: ${rate}%.`,
  );

  html += table(
    ["Result", "Count", "Percentage"],
    [
      [`${badge("PASS")} PASS`, String(pass), total > 0 ? `${Math.round((pass / total) * 100)}%` : "—"],
      [`${badge("FAIL")} FAIL`, String(fail), total > 0 ? `${Math.round((fail / total) * 100)}%` : "—"],
      [`${badge("PARTIAL")} PARTIAL`, String(partial), total > 0 ? `${Math.round((partial / total) * 100)}%` : "—"],
      [`${badge("NOT_APPLICABLE")} N/A`, String(na), total > 0 ? `${Math.round((na / total) * 100)}%` : "—"],
    ],
  );

  // Per-hardware assessment
  const byHw = groupBy(assessments, (a) => a.hardware.name);
  let idx = 1;
  html += `<h2>2. Detailed Assessment Results</h2>`;
  for (const [hwName, checks] of byHw) {
    const hwInfo = hw.find((h) => h.name === hwName);
    html += `<h3>2.${idx}. ${esc(hwName)}</h3>`;
    if (hwInfo) {
      html += `<p style="font-size:13px;color:#525252">Location: ${esc(hwInfo.location || "—")} | Zone: ${esc(hwInfo.zone || "—")} | IP: ${esc(hwInfo.ipAddress || "—")}</p>`;
    }
    html += table(
      ["Check ID", "Result", "Evidence", "Notes"],
      checks.map((a) => [esc(a.checkId), badge(a.result), esc(a.evidence || "—"), esc(a.note || "—")]),
    );
    idx++;
  }

  // Findings
  const findings = assessments.filter((a) => a.result === "FAIL" || a.result === "PARTIAL");
  if (findings.length > 0) {
    html += `<h2>3. Findings & Recommendations</h2>`;
    html += `<p>${findings.length} item(s) require remediation:</p><ul>`;
    for (const f of findings) {
      html += `<li><strong>${esc(f.hardware.name)}</strong> — ${esc(f.checkId)}: ${badge(f.result)} ${f.note ? esc(f.note) : ""}</li>`;
    }
    html += `</ul>`;
  }

  return html;
}

function previewTOP(hw: HwItem[]): string {
  const zones = groupBy(hw, (h) => h.zone || "Unassigned");

  let html = section(
    "1. Overview",
    `Network topology description covering ${hw.length} asset(s) across ${zones.size} security zone(s): ${[...zones.keys()].join(", ")}.`,
  );

  // Zone overview
  html += `<h2>2. Security Zones</h2>`;
  html += table(
    ["Zone", "Asset Count", "Description"],
    [...zones.entries()].map(([z, assets]) => [
      esc(z), String(assets.length),
      `Contains ${assets.map((a) => a.type).filter((v, i, arr) => arr.indexOf(v) === i).join(", ")} type assets`,
    ]),
  );

  // Assets per zone
  html += `<h2>3. Assets per Zone</h2>`;
  let idx = 1;
  for (const [zone, assets] of zones) {
    html += `<h3>3.${idx}. ${esc(zone)}</h3>`;
    html += table(
      ["Asset Name", "Type", "IP Address", "Location"],
      assets.map((a) => [esc(a.name), esc(a.type), esc(a.ipAddress || "—"), esc(a.location || "—")]),
    );
    idx++;
  }

  // Network connections (assets with IP)
  const networked = hw.filter((h) => h.ipAddress);
  if (networked.length > 0) {
    html += `<h2>4. Network Connections</h2>`;
    html += table(
      ["#", "Asset Name", "IP Address", "MAC Address", "Zone", "Connected Software"],
      networked.map((h, i) => [
        String(i + 1), esc(h.name), esc(h.ipAddress || "—"), esc(h.macAddress || "—"),
        esc(h.zone || "—"), h.software.map((s) => esc(s.name)).join(", ") || "—",
      ]),
    );
  }

  return html;
}

function previewVUL(hw: HwItem[], sw: SwItem[], assessments: AssItem[]): string {
  const counts = { pass: 0, fail: 0, partial: 0, total: assessments.length };
  for (const a of assessments) {
    if (a.result === "PASS") counts.pass++;
    if (a.result === "FAIL") counts.fail++;
    if (a.result === "PARTIAL") counts.partial++;
  }
  const zones = groupBy(hw, (h) => h.zone || "Unassigned");

  let html = section(
    "1. Purpose and Scope",
    `This document identifies and assesses cybersecurity vulnerabilities in the CBS of this vessel. Scope: ${hw.length} hardware and ${sw.length} software assets.`,
  );

  html += section("2. Vulnerability Identification Methods", "The following methods were used:", [
    "Automated CVE matching against the NVD for all registered software (CPE-based)",
    "Security configuration assessment (SC-1 through SC-13) for each hardware asset",
    "Manual review of software versions against known vulnerability advisories",
  ]);

  html += section(
    "3. CBS Overview",
    `${hw.length} hardware assets across ${zones.size} zone(s): ${[...zones.keys()].join(", ")}. ${sw.length} software components registered.`,
  );

  html += `<h2>4. Security Assessment Summary</h2>`;
  html += `<p>${counts.total} checks performed: ${counts.pass} PASS, ${counts.fail} FAIL, ${counts.partial} PARTIAL.</p>`;

  const findings = assessments.filter((a) => a.result === "FAIL" || a.result === "PARTIAL");
  if (findings.length > 0) {
    html += `<h2>5. Failed and Partial Items</h2><p>${findings.length} item(s) require remediation:</p>`;
    html += table(
      ["Hardware", "Type", "Zone", "Check", "Result", "Evidence", "Notes"],
      findings.map((a) => {
        const h = hw.find((x) => x.id === a.hardwareId);
        return [esc(a.hardware.name), esc(a.hardware.type), esc(h?.zone || "—"), esc(a.checkId), badge(a.result), esc(a.evidence || "—"), esc(a.note || "—")];
      }),
    );
  }

  // Software CVE reference
  if (sw.length > 0) {
    html += `<h2>6. Software Inventory (CVE Reference)</h2>`;
    html += table(
      ["Software", "Version", "Vendor", "Type", "CPE", "CVE Matches"],
      sw.map((s) => [
        esc(s.name), esc(s.version || "—"), esc(s.vendor || "—"), esc(s.swType),
        esc(s.cpe || "Not registered"), String(s._count.cveMatches),
      ]),
    );
  }

  return html;
}

function previewACC(hw: HwItem[], assessments: AssItem[]): string {
  const zones = groupBy(hw, (h) => h.zone || "Unassigned");
  const scChecks = assessments.filter((a) => ["SC-1", "SC-2", "SC-3"].includes(a.checkId));

  let html = section(
    "1. Purpose and Scope",
    `Access control policy for the CBS. Covers user authentication and authorization per IACS UR E27 (SC-1, SC-2, SC-3).`,
  );

  html += section("2. User Roles and Privileges", "The following roles are defined for CBS access:", [
    "Administrator — Full system access including configuration changes",
    "Operator — Operational functions, monitoring, alarm acknowledgment",
    "Service Technician — Temporary maintenance access with time-limited credentials",
    "Auditor — Read-only access for compliance verification",
  ]);

  html += section("3. Password Policy (SC-1)", `All CBS components must enforce password requirements. ${hw.length} hardware asset(s) assessed.`, [
    "Minimum length: 8 characters (12 for admin)",
    "Complexity: upper + lower + number + special",
    "Maximum age: 90 days (admin), 180 days (operator)",
    "Account lockout: 5 failed attempts → 15 min lock",
    "No reuse of last 5 passwords",
  ]);

  html += section("4. Account Management (SC-2)", "Account management procedures:", [
    "Individual accounts only — no shared accounts",
    "Guest/anonymous access disabled",
    "Departing personnel accounts disabled within 24 hours",
    "Quarterly review of all active accounts",
  ]);

  html += section(
    "5. Network Access Control (SC-3)",
    `Network access controlled across ${zones.size} zone(s): ${[...zones.keys()].join(", ")}.`,
    ["Inter-zone communication restricted to permitted connections", "Remote access requires MFA", "Unused ports disabled"],
  );

  if (scChecks.length > 0) {
    html += `<h2>6. Access Control Assessment Results</h2>`;
    html += table(
      ["Hardware", "Type", "Zone", "Check", "Result", "Evidence", "Notes"],
      scChecks.map((a) => {
        const h = hw.find((x) => x.id === a.hardwareId);
        return [esc(a.hardware.name), esc(a.hardware.type), esc(h?.zone || "—"), esc(a.checkId), badge(a.result), esc(a.evidence || "—"), esc(a.note || "—")];
      }),
    );
  }

  return html;
}

function previewINC(project: ProjectCtx): string {
  return (
    section("1. Purpose and Scope", `Cybersecurity Incident Response Plan for the CBS. Defines procedures for detecting, responding to, and recovering from cybersecurity incidents per IACS UR E27.`) +
    section("2. Incident Classification", "Incidents classified by severity:", [
      "CRITICAL — Complete CBS compromise, direct safety impact, immediate Master notification",
      "HIGH — Major system disruption, potential safety impact, SSO notification within 1 hour",
      "MEDIUM — Limited disruption, no direct safety impact, containable",
      "LOW — Minor anomaly, informational, logged for trend analysis",
    ]) +
    section("3. Detection and Reporting", "Detection channels:", [
      "Automated monitoring: system alerts, IDS, audit log anomalies",
      "Personnel observation: unusual system behavior",
      "External notification: vendor advisories, CERT alerts",
    ]) +
    section("4. Response Procedures", "Upon incident confirmation:", [
      "IDENTIFY — Confirm incident, determine affected systems",
      "CONTAIN — Isolate affected systems from CBS network",
      "NOTIFY — Alert SSO, Master, and relevant authorities",
      "DOCUMENT — Record all details, timestamps, actions",
      "ERADICATE — Remove threat, patch vulnerabilities",
      "RECOVER — Restore from verified backups, validate integrity",
      "REVIEW — Post-incident analysis, update procedures",
    ]) +
    section("5. Communication Protocol", "Incident communications:", [
      "Internal: Duty Officer → SSO → Master → CSO",
      `External: SSO → ${esc(project.classification || "Classification Society")} → Flag State`,
      `Ship Owner: ${esc(project.shipowner || "(To be specified)")}`,
    ])
  );
}

function previewMON(hw: HwItem[], assessments: AssItem[]): string {
  const sc7 = assessments.filter((a) => a.checkId === "SC-7");

  let html = section(
    "1. Purpose and Scope",
    `Monitoring and logging strategy for the CBS per IACS UR E27 SC-7 (Audit Logging). Covers ${hw.length} hardware asset(s).`,
  );

  if (sc7.length > 0) {
    html += `<h2>2. SC-7 Compliance Status</h2>`;
    html += table(
      ["Hardware", "Type", "Zone", "Result", "Evidence", "Notes"],
      sc7.map((a) => {
        const h = hw.find((x) => x.id === a.hardwareId);
        return [esc(a.hardware.name), esc(a.hardware.type), esc(h?.zone || "—"), badge(a.result), esc(a.evidence || "—"), esc(a.note || "—")];
      }),
    );
  }

  html += section("3. Events to be Logged", "The following events shall be captured:", [
    "Authentication events — login/logout, password changes, lockout",
    "Authorization events — access grants, denials, privilege changes",
    "Configuration changes — parameter modifications, firmware updates",
    "System events — startup, shutdown, errors, warnings",
    "Network events — connection establishment, firewall blocks",
    "Security events — malware detection, intrusion alerts",
  ]);

  html += section("4. Log Retention", "Requirements:", [
    "Minimum 90 days onboard, 1 year shore-based",
    "Tamper-evident format where feasible",
    "Capacity monitoring — alert at 80%",
  ]);

  if (hw.length > 0) {
    html += `<h2>5. CBS Asset Log Sources</h2>`;
    html += table(
      ["Asset", "Type", "Zone", "IP Address", "Log Capability"],
      hw.map((h) => [
        esc(h.name), esc(h.type), esc(h.zone || "—"), esc(h.ipAddress || "—"),
        sc7.find((a) => a.hardwareId === h.id)?.result === "PASS" ? "Verified" : "To be verified",
      ]),
    );
  }

  return html;
}

function previewCHG(hw: HwItem[], sw: SwItem[]): string {
  let html = section(
    "1. Purpose and Scope",
    `Change management procedures for the CBS. All modifications to ${hw.length} hardware and ${sw.length} software assets must follow these procedures per IACS UR E27.`,
  );

  html += section("2. Change Categories", "Changes categorized by type:", [
    "Hardware Change — Addition, removal, replacement of CBS hardware",
    "Software Change — Installation, update, removal of software/firmware",
    "Configuration Change — System settings, firewall rules, access policies",
    "Network Change — Topology modifications, zone boundary changes",
  ]);

  html += section("3. Change Approval Workflow", "All changes follow:", [
    "1. REQUEST — Submit with description and risk assessment",
    "2. REVIEW — Security officer evaluates cybersecurity impact",
    "3. PLAN — Implementation plan with rollback procedures",
    "4. APPROVE — Final authorization",
    "5. IMPLEMENT — Execute per approved plan",
    "6. VERIFY — Confirm and run relevant SC checks",
    "7. CLOSE — Update inventory, document results",
  ]);

  html += `<h2>4. Current CBS Hardware Scope</h2>`;
  html += table(
    ["Asset", "Type", "Manufacturer", "Model", "Zone", "IP Address"],
    hw.map((h) => [esc(h.name), esc(h.type), esc(h.manufacturer || "—"), esc(h.model || "—"), esc(h.zone || "—"), esc(h.ipAddress || "—")]),
  );

  html += `<h2>5. Change Log</h2>`;
  html += table(
    ["Date", "Change ID", "Description", "Affected Asset(s)", "Category", "Approver", "Status"],
    [["", "", "", "", "", "", ""], ["", "", "", "", "", "", ""]],
  );

  return html;
}

function previewTRN(hw: HwItem[]): string {
  const zones = groupBy(hw, (h) => h.zone || "Unassigned");

  let html = section(
    "1. Purpose and Scope",
    `Cybersecurity training requirements and records for personnel operating the CBS per IACS UR E27. Covers ${hw.length} hardware assets.`,
  );

  html += section("2. Training Program", "Structured by role and frequency:", [
    "All CBS users: Cybersecurity awareness (annual, mandatory)",
    "Operators: CBS-specific operational procedures (initial + annual)",
    "Administrators: Advanced system administration (initial + annual)",
    "All users: Incident response procedures (annual)",
    "All users: Access control and password management (initial + after changes)",
  ]);

  html += section("3. Core Training Modules", "Topics covered:", [
    "Module 1: Cybersecurity fundamentals and maritime threats",
    "Module 2: CBS architecture and security zones",
    "Module 3: Password policy and account management (SC-1, SC-2)",
    "Module 4: Recognizing and reporting suspicious activity",
    "Module 5: Incident response procedures",
    "Module 6: Physical security for CBS equipment",
    "Module 7: Removable media and USB policy",
  ]);

  html += section(
    "4. CBS-Specific Training",
    `Personnel must be familiar with ${hw.length} hardware assets across ${zones.size} zone(s): ${[...zones.keys()].join(", ")}.`,
  );

  html += `<h2>5. Training Record</h2>`;
  html += table(
    ["Date", "Attendee", "Role", "Module/Topic", "Trainer", "Duration", "Result"],
    [["", "", "", "", "", "", ""], ["", "", "", "", "", "", ""], ["", "", "", "", "", "", ""]],
  );

  return html;
}

function previewBAK(hw: HwItem[]): string {
  return (
    section("1. Purpose and Scope", `Backup and recovery plan for the CBS. Covers ${hw.length} hardware and associated software assets.`) +
    section("2. Backup Strategy", "Three categories:", [
      "System images: Complete OS and application snapshots",
      "Configuration data: System parameters, network settings, firewall rules",
      "Operational data: Security logs, assessment records, change history",
    ]) +
    section("3. Backup Schedule", "Maintained for all CBS assets:", [
      "Full system image — Before commissioning, before/after major updates, minimum annually",
      "Configuration backup — After every approved change, minimum monthly",
      "Software/firmware — Before and after every update or patch",
      "Security log archive — Weekly transfer to long-term storage",
    ]) +
    section("4. Recovery Objectives", "Recovery targets:", [
      "Critical safety systems (navigation, propulsion): RTO < 4 hours",
      "Operational systems: RTO < 24 hours",
      "Recovery Point Objective (RPO): Per asset criticality",
    ]) +
    section("5. Recovery Procedures", "Steps:", [
      "1. Identify affected system(s), select appropriate backup",
      "2. Verify backup integrity before restoration",
      "3. Restore to known-good state",
      "4. Verify functionality and network connectivity",
      "5. Re-run relevant SC checks",
      "6. Document the recovery event",
    ])
  );
}

function previewPHY(hw: HwItem[]): string {
  const locations = groupBy(hw, (h) => h.location || "Unspecified");

  let html = section(
    "1. Purpose and Scope",
    `Physical security measures for CBS equipment. Covers ${hw.length} hardware assets across ${locations.size} location(s).`,
  );

  html += section("2. Physical Access Controls", "Controls by area:", [
    "Bridge — Supervised access, CBS in locked cabinets, key control by OOW",
    "Engine Control Room — Restricted to engineering personnel, dedicated rack with key lock",
    "Server/Network Room — Locked room, key-card access, entry logged",
    "Network Distribution Points — Locked cabinets with tamper-evident seals",
  ]);

  html += section("3. Tamper Detection", "Measures applied:", [
    "Tamper-evident seals on network cabinets",
    "Serial number verification during quarterly inspections",
    "Visual inspection of cable connections during routine rounds",
  ]);

  html += section("4. Removable Media Policy", "Controls:", [
    "USB ports disabled unless specifically approved",
    "Removable media scanned before connection to CBS",
    "Personal devices prohibited on CBS networks",
  ]);

  html += `<h2>5. Equipment Locations</h2>`;
  html += table(
    ["Location", "Asset Count", "Assets", "Zone(s)"],
    [...locations.entries()].map(([loc, assets]) => [
      esc(loc), String(assets.length),
      assets.map((a) => esc(a.name)).join(", "),
      [...new Set(assets.map((a) => a.zone || "Unassigned"))].join(", "),
    ]),
  );

  return html;
}

function previewSUP(hw: HwItem[], sw: SwItem[]): string {
  const vendors = new Map<string, { products: string[]; types: Set<string> }>();
  for (const h of hw) {
    if (h.manufacturer) {
      if (!vendors.has(h.manufacturer)) vendors.set(h.manufacturer, { products: [], types: new Set() });
      const v = vendors.get(h.manufacturer)!;
      v.products.push(`${h.name} (HW)`);
      v.types.add("Hardware");
    }
  }
  for (const s of sw) {
    if (s.vendor) {
      if (!vendors.has(s.vendor)) vendors.set(s.vendor, { products: [], types: new Set() });
      const v = vendors.get(s.vendor)!;
      v.products.push(`${s.name} v${s.version || "?"} (SW)`);
      v.types.add("Software");
    }
  }

  let html = section(
    "1. Purpose and Scope",
    `Supply chain security requirements for CBS components. Covers ${hw.length} hardware and ${sw.length} software assets from ${vendors.size} vendor(s).`,
  );

  html += section("2. Procurement Security", "Requirements:", [
    "Vendor identity verification — genuine manufacturer or authorized distributor",
    "Component authenticity — serial numbers, certificates of conformity",
    "Software integrity — checksums, digital signatures, hash verification",
    "Chain of custody documentation from manufacturer to installation",
    "Contractual cybersecurity obligations (patch support, vulnerability disclosure)",
  ]);

  html += section("3. Software Update Supply Chain", "Secure delivery:", [
    "Updates from verified vendor sources only",
    "Integrity verification before installation",
    "Testing in isolated environment before production deployment",
  ]);

  if (vendors.size > 0) {
    html += `<h2>4. Vendor Registry</h2>`;
    html += table(
      ["Vendor", "Type", "Products", "Count"],
      [...vendors.entries()].map(([name, v]) => [
        esc(name), [...v.types].join(", "), v.products.map((p) => esc(p)).join("; "), String(v.products.length),
      ]),
    );
  }

  return html;
}

// ─── E26 Previews ───────────────────────────────────────────────────────────

function previewE26CRP(project: ProjectCtx): string {
  return (
    section("1. Purpose and Scope", `Cyber Risk Policy for vessel "${project.vesselName}" per IACS UR E26. Defines organizational commitment to managing cyber risks.`) +
    section("2. Policy Statement", `The operator is committed to managing cybersecurity risks to ensure safe and secure vessel operations.`) +
    section("3. Roles and Responsibilities", "Cybersecurity governance:", [
      "Designated Person Ashore (DPA) — Overall cybersecurity oversight",
      "Company Security Officer (CSO) — Policy development and compliance",
      "Ship Security Officer (SSO) — Onboard implementation",
      "Master — Final authority for onboard decisions",
      "Chief Engineer — OT system security",
    ]) +
    section("4. Risk Management Framework", "Continuous cycle:", [
      "IDENTIFY — Inventory CBS assets, determine criticality",
      "PROTECT — Implement security controls",
      "DETECT — Monitor for anomalies",
      "RESPOND — Execute incident response",
      "RECOVER — Restore systems and resume operations",
    ]) +
    section("5. SMS Integration", "Cyber risk policy integrated into Safety Management System per ISM Code.")
  );
}

function previewE26CRA(hw: HwItem[], sw: SwItem[], assessments: AssItem[]): string {
  const counts = { pass: 0, fail: 0, partial: 0, total: assessments.length };
  for (const a of assessments) {
    if (a.result === "PASS") counts.pass++;
    if (a.result === "FAIL") counts.fail++;
    if (a.result === "PARTIAL") counts.partial++;
  }
  const zones = groupBy(hw, (h) => h.zone || "Unassigned");

  let html = section(
    "1. Purpose and Scope",
    `Cyber Risk Assessment for this vessel per IACS UR E26. Identifies threats, assesses vulnerabilities, evaluates impacts, and determines risk levels.`,
  );

  html += section(
    "2. CBS Asset Summary",
    `${hw.length} hardware assets and ${sw.length} software components across ${zones.size} zone(s).`,
  );

  html += section("3. Threat Landscape", "Threat categories considered:", [
    "Malware — Ransomware, worms targeting operational systems",
    "Unauthorized access — Weak credentials, network access exploitation",
    "Insider threat — Accidental or malicious personnel actions",
    "Supply chain compromise — Malicious code, counterfeit hardware",
    "Physical attack — Unauthorized access to CBS equipment",
  ]);

  html += `<h2>4. Security Assessment Summary</h2>`;
  html += `<p>Results: ${counts.pass} PASS, ${counts.fail} FAIL, ${counts.partial} PARTIAL out of ${counts.total} checks.</p>`;
  if (assessments.length > 0) {
    html += table(
      ["Hardware", "Type", "Zone", "Check", "Result", "Notes"],
      assessments.map((a) => {
        const h = hw.find((x) => x.id === a.hardwareId);
        return [esc(a.hardware.name), esc(a.hardware.type), esc(h?.zone || "—"), esc(a.checkId), badge(a.result), esc(a.note || "—")];
      }),
    );
  }

  html += section("5. Risk Treatment Options", "For each identified risk:", [
    "MITIGATE — Additional controls to reduce risk",
    "ACCEPT — Within acceptable threshold",
    "TRANSFER — Shared through contracts or insurance",
    "AVOID — Change activity or configuration to eliminate risk",
  ]);

  return html;
}

function previewE26SZD(hw: HwItem[]): string {
  const zones = groupBy(hw, (h) => h.zone || "Unassigned");

  let html = section(
    "1. Purpose and Scope",
    `Security Zone Design for the CBS per IACS UR E26. ${zones.size} zone(s) defined: ${[...zones.keys()].join(", ")}.`,
  );

  html += section("2. Inter-Zone Communication", "Policies:", [
    "All inter-zone traffic through controlled conduits (firewalls, data diodes)",
    "Only explicitly permitted communication flows",
    "Safety-critical to non-critical zones require additional validation",
    "External connections isolated from operational zones",
  ]);

  html += `<h2>3. Zone Asset Assignment</h2>`;
  html += table(
    ["Zone", "Asset", "Type", "IP Address", "Connected Software"],
    [...zones.entries()].flatMap(([zone, assets]) =>
      assets.map((h) => [esc(zone), esc(h.name), esc(h.type), esc(h.ipAddress || "—"), h.software.map((s) => esc(s.name)).join(", ") || "—"]),
    ),
  );

  html += section("4. Network Topology Reference", "Refer to the DFD diagram for visual representation of zone boundaries, assets, and communication paths.");

  return html;
}

function previewE26TRN(hw: HwItem[]): string {
  const zones = groupBy(hw, (h) => h.zone || "Unassigned");

  let html = section(
    "1. Purpose and Scope",
    `Ship-level Cybersecurity Training Plan per IACS UR E26. Defines organizational training program for all personnel interacting with the CBS.`,
  );

  html += section("2. Training Governance", "Under the Safety Management System:", [
    "DPA — Approves annual training plan and budget",
    "CSO — Develops training content, verifies compliance",
    "SSO — Coordinates onboard training delivery",
    "Master — Ensures all onboard personnel complete training",
  ]);

  html += section("3. Competency Levels", "Three levels:", [
    "Level 1 AWARENESS (All crew): Basic cyber hygiene, phishing recognition, reporting",
    "Level 2 OPERATIONAL (Watch officers, engineers): CBS procedures, monitoring, alarm response",
    "Level 3 SPECIALIST (IT/OT admins, SSO): System administration, vulnerability assessment, incident response",
  ]);

  html += `<h2>4. Annual Training Schedule</h2>`;
  html += table(
    ["Quarter", "Module", "Target Audience", "Duration", "Method"],
    [
      ["Q1", "Cybersecurity Awareness Refresher", "All crew (Level 1)", "2 hours", "Classroom + Self-study"],
      ["Q2", "CBS Operations & Incident Drill", "Level 2", "4 hours", "Practical exercise"],
      ["Q3", "Cyber Incident Table-top Exercise", "Level 2+3", "4 hours", "Scenario discussion"],
      ["Q4", "Annual Review & Assessment", "All levels", "2 hours", "Assessment + review"],
    ],
  );

  html += `<h2>5. CBS Zones Covered</h2>`;
  html += table(
    ["Zone", "Asset Count", "Key Systems"],
    [...zones.entries()].map(([z, assets]) => [
      esc(z), String(assets.length),
      assets.slice(0, 3).map((a) => esc(a.name)).join(", ") + (assets.length > 3 ? ` (+${assets.length - 3} more)` : ""),
    ]),
  );

  return html;
}

function previewE26IRP(project: ProjectCtx, hw: HwItem[]): string {
  const zones = groupBy(hw, (h) => h.zone || "Unassigned");

  let html = section(
    "1. Purpose and Scope",
    `Ship-level Cybersecurity Incident Response Procedure per IACS UR E26. Defines command structure, communication protocols, and coordination for managing cyber incidents.`,
  );

  html += section("2. Incident Command Structure", "Activated upon incident confirmation:", [
    "Master — Ultimate onboard authority, authorizes external notifications",
    "SSO — Incident Commander, coordinates response",
    "Chief Engineer — OT System Lead for propulsion/power/machinery",
    "OOW — Navigation Lead, activates manual fallback",
    "CSO — Shore-side coordination, regulatory notifications",
    "DPA — Safety oversight, SMS compliance",
  ]);

  html += section("3. Incident Levels", "Classified by impact:", [
    "LEVEL 1 CRITICAL: Safety systems compromised, immediate Master notification",
    "LEVEL 2 MAJOR: Operations significantly degraded, CSO notified < 1 hour",
    "LEVEL 3 MODERATE: Single system affected, CSO notified < 4 hours",
    "LEVEL 4 MINOR: Suspicious activity, no operational impact, daily report",
  ]);

  html += `<h2>4. Notification Matrix</h2>`;
  html += table(
    ["Level", "Master", "SSO", "CSO", "DPA", "Classification", "Flag State"],
    [
      ["Level 1", "Immediate", "Immediate", "< 1 hour", "< 1 hour", "< 4 hours", "As required"],
      ["Level 2", "< 15 min", "Immediate", "< 1 hour", "< 4 hours", "< 24 hours", "As required"],
      ["Level 3", "Daily report", "< 1 hour", "< 4 hours", "Weekly", "If class equip.", "—"],
      ["Level 4", "If needed", "< 4 hours", "Daily report", "Monthly", "—", "—"],
    ],
  );

  html += section("5. Degraded Operations", "Manual fallback capabilities:", [
    "Manual navigation (paper charts, visual bearings, manual radar)",
    "Manual engine control from engine room",
    "Manual fire detection and alarm",
    "Satellite phone / VHF for communications",
  ]);

  html += `<h2>6. CBS Zones at Risk</h2>`;
  html += table(
    ["Zone", "Assets", "Critical Systems", "Manual Fallback"],
    [...zones.entries()].map(([z, assets]) => [
      esc(z), String(assets.length),
      assets.slice(0, 3).map((a) => esc(a.name)).join(", "),
      "[To be verified]",
    ]),
  );

  html += section("7. Emergency Contacts", `Classification: ${esc(project.classification || "[To be specified]")}\nShip Owner: ${esc(project.shipowner || "[To be specified]")}`);

  return html;
}

// ─── E27 New Required Documents ──────────────────────────────────────────────

function previewSDL(hw: HwItem[]): string {
  const zones = groupBy(hw, (h) => h.zone || "Unassigned");
  return (
    section("1. Purpose and Scope", `Secure Development Lifecycle (SDL) per IACS UR E27 Section 5 and IEC 62443-4-1. Covers security practices across all lifecycle phases for ${hw.length} CBS assets.`) +
    section("2. Defence-in-Depth Strategy (SG-1)", `Layered security across ${zones.size} zone(s):`, [
      "Network layer — Segmentation via firewalls, VLANs, zone-based access",
      "Host layer — OS hardening, least functionality, disabled unnecessary services",
      "Application layer — Input validation, secure coding, authentication",
      "Data layer — Encryption at rest and in transit, integrity verification",
      "Physical layer — Access controls, tamper detection",
    ]) +
    section("3. Development Phases", "Security integrated into each phase:", [
      "Requirement Analysis — Security requirements from E27 capabilities",
      "Design — Threat modelling, secure architecture",
      "Implementation — Secure coding, code review, static analysis",
      "Verification — Security testing, penetration testing",
      "Release — Code signing, integrity verification",
      "Maintenance — Patch management, vulnerability monitoring",
      "End-of-Life — Secure decommissioning, data sanitization",
    ]) +
    section("4. Security Update Process (SUM-2/3/4)", "Update requirements:", [
      "Version number, installation instructions, security impact, risk of non-application",
      "Compatibility with dependent components documented",
      "Authenticated distribution with integrity verification",
    ]) +
    section("5. Code Signing (SM-8)", "Key management:", [
      "HSM or equivalent secure key storage",
      "Access restricted to authorized build/release personnel",
      "All distributed software signed and verified",
    ])
  );
}

function previewMNT(hw: HwItem[]): string {
  let html = section("1. Purpose and Scope", `Maintenance plan per IACS UR E27 Section 3(g). Covers ${hw.length} CBS assets.`) +
    section("2. Maintenance Types", "Four categories:", [
      "Preventive — Scheduled maintenance (firmware updates, certificate renewal)",
      "Corrective — Unscheduled repairs after failure",
      "Adaptive — Changes for new requirements",
      "Security — Patches, signature updates, vulnerability remediation",
    ]) +
    section("3. Schedule", "Periodic tasks:", [
      "Daily — Log review, system health monitoring",
      "Weekly — Security signature updates, disk space monitoring",
      "Monthly — Config backup, account review, certificate check",
      "Quarterly — Full security assessment review",
      "Annually — System image backup, hardware inspection, survey prep",
    ]) +
    section("4. Remote Maintenance", "Controls:", [
      "Enabled only with crew approval (E27 Cap. 37)",
      "MFA required (E27 Cap. 32)",
      "Sessions monitored and logged (E27 Cap. 36)",
      "Auto-termination after inactivity",
    ]);

  html += `<h2>5. Maintenance Matrix</h2>`;
  html += table(
    ["Asset", "Type", "Zone", "Manufacturer", "Remote Access"],
    hw.map((h) => [esc(h.name), esc(h.type), esc(h.zone || "—"), esc(h.manufacturer || "—"), h.ipAddress ? "Possible" : "N/A"]),
  );
  return html;
}

function previewTST(hw: HwItem[], assessments: AssItem[]): string {
  let html = section("1. Purpose and Scope", `System test plan per IACS UR E27 Section 3(i). Verifies all 41 security capabilities for ${hw.length} CBS assets.`) +
    section("2. Test Strategy", "Verification methods:", [
      "Functional — Verify each capability operates as specified",
      "Configuration — Verify security settings configurable as required",
      "Negative — Verify correct rejection of unauthorized access",
      "Recovery — Verify backup/restore/recovery procedures",
      "Integration — Verify capabilities in integrated vessel network",
    ]) +
    section("3. Capability Test Groups", "Organized by E27 capability:", [
      "Cap. 1-7: Identification & Authentication",
      "Cap. 8-12: Use Control (authorization, session lock, mobile code)",
      "Cap. 13-16: Audit (events, storage, timestamps)",
      "Cap. 17-21: Data Integrity (communication, malware, input validation)",
      "Cap. 22-23: Confidentiality (encryption, cryptography)",
      "Cap. 24: Audit Access",
      "Cap. 25-31: Availability (DoS, backup, recovery, least functionality)",
      "Cap. 32-41: Untrusted Networks (MFA, remote session, etc.)",
    ]) +
    section("4. Acceptance Criteria", "Results:", [
      "PASS — Fully implemented and functioning",
      "PASS with Compensating Countermeasure — Met through alternative means",
      "FAIL — Not met, remediation required",
      "NOT APPLICABLE — Not relevant (justified)",
    ]);

  html += `<h2>5. Test Matrix</h2>`;
  html += table(
    ["Asset", "Type", "Zone", "FAT", "HAT/SAT", "Status"],
    hw.map((h) => [esc(h.name), esc(h.type), esc(h.zone || "—"), "[Date]", "[Date]", "[Pending]"]),
  );
  return html;
}

function previewHDN(hw: HwItem[], assessments: AssItem[]): string {
  let html = section("1. Purpose and Scope", `Hardening guidelines per IACS UR E27 Section 5.7 (SG-3). Covers ${hw.length} CBS assets.`) +
    section("2. OS Hardening", "Requirements:", [
      "Remove/disable unnecessary OS components and services",
      "Disable AutoRun/AutoPlay (SC-5)",
      "Disable insecure protocols: Telnet, FTP, SMBv1 (SC-5)",
      "Apply latest security patches (SC-13)",
      "Disable guest accounts, rename default admin (SC-2)",
    ]) +
    section("3. Network Hardening", "Requirements:", [
      "Close unused ports, disable unnecessary services",
      "Configure host-based firewalls",
      "Disable RDP unless required; enforce NLA + TLS (SC-6)",
      "Configure SNMP v3 (disable v1/v2)",
    ]) +
    section("4. Application Hardening", "Requirements:", [
      "Remove sample/demo/test applications",
      "Disable debug modes in production",
      "Configure session timeout (SC-10)",
      "Disable unnecessary mobile code execution",
    ]) +
    section("5. Anti-Malware (SC-11)", "Configuration:", [
      "Install AV or application whitelisting",
      "Enable real-time scanning where feasible",
      "Configure removable media scanning",
    ]) +
    section("6. Audit Logging (SC-7)", "Configuration:", [
      "Enable auth, config change, and system event logging",
      "Configure NTP synchronization",
      "Set 90-day minimum retention",
      "Protect logs from unauthorized modification",
    ]);

  html += `<h2>7. Hardening Status</h2>`;
  html += table(
    ["Asset", "Type", "SC-5 (Network)", "SC-7 (Logging)", "SC-11 (AV)", "SC-13 (Patch)"],
    hw.map((h) => {
      const get = (sc: string) => assessments.find((a) => a.hardwareId === h.id && a.checkId === sc);
      return [
        esc(h.name), esc(h.type),
        get("SC-5") ? badge(get("SC-5")!.result) : "—",
        get("SC-7") ? badge(get("SC-7")!.result) : "—",
        get("SC-11") ? badge(get("SC-11")!.result) : "—",
        get("SC-13") ? badge(get("SC-13")!.result) : "—",
      ];
    }),
  );
  return html;
}

// ─── E26 New Required Documents ─────────────────────────────────────────────

function previewE26INV(hw: HwItem[], sw: SwItem[]): string {
  const zones = groupBy(hw, (h) => h.zone || "Unassigned");

  let html = section(
    "1. Purpose and Scope",
    `Vessel-level asset inventory per IACS UR E26. Consolidates all CBS assets: ${hw.length} hardware, ${sw.length} software across ${zones.size} zone(s).`,
  );

  html += `<h2>2. Hardware Inventory</h2>`;
  html += table(
    ["#", "Asset", "Type", "Manufacturer", "Model", "IP", "Zone", "Location"],
    hw.map((h, i) => [
      String(i + 1), esc(h.name), esc(h.type), esc(h.manufacturer || "—"),
      esc(h.model || "—"), esc(h.ipAddress || "—"), esc(h.zone || "—"), esc(h.location || "—"),
    ]),
  );

  html += `<h2>3. Software Inventory</h2>`;
  html += table(
    ["#", "Software", "Version", "Vendor", "Type", "CPE", "Installed On"],
    sw.map((s, i) => [
      String(i + 1), esc(s.name), esc(s.version || "—"), esc(s.vendor || "—"),
      esc(s.swType), esc(s.cpe || "—"), esc(s.hardware?.name || "—"),
    ]),
  );

  html += `<h2>4. Zone Distribution</h2>`;
  html += table(
    ["Zone", "HW Count", "Key Assets"],
    [...zones.entries()].map(([z, a]) => [esc(z), String(a.length), a.slice(0, 4).map((x) => esc(x.name)).join(", ")]),
  );

  return html;
}

function previewE26DES(project: ProjectCtx, hw: HwItem[], assessments: AssItem[]): string {
  const zones = groupBy(hw, (h) => h.zone || "Unassigned");
  const counts = { pass: 0, fail: 0, total: assessments.length };
  for (const a of assessments) { if (a.result === "PASS") counts.pass++; if (a.result === "FAIL") counts.fail++; }

  let html = section("1. Purpose and Scope", `Cyber-Security Design Description per IACS UR E26. Covers security architecture across all five functional areas for ${hw.length} CBS assets.`);

  html += section("2. Network Security Architecture", `${zones.size} security zone(s): ${[...zones.keys()].join(", ")}.`, [
    "OT systems isolated in dedicated zones",
    "Firewalls/data diodes control inter-zone communication",
    "Shore connections isolated from operational zones",
  ]);

  html += section("3. Protection Mechanisms", "Implemented:", [
    "Network segmentation — Zone-based firewall rules",
    "Anti-malware — Protection on compatible assets (E27 Cap. 18)",
    "Access control — Role-based with least privilege (E27 Cap. 1-7)",
    "Remote access — Crew approval, MFA, session monitoring (E27 Cap. 37)",
    "Software updates — Pre-tested with rollback (E27 Cap. 28)",
  ]);

  html += section("4. Detection & Response", "Capabilities:", [
    "Network monitoring with anomaly alerts",
    "IDS in passive mode on key segments",
    "Audit logging on all CBS assets (E27 Cap. 13-16)",
    "Network isolation capability per zone",
    "Manual fallback for all critical functions",
  ]);

  html += `<h2>5. Zone Architecture</h2>`;
  html += table(
    ["Zone", "Assets", "Types", "Network Range"],
    [...zones.entries()].map(([z, a]) => [
      esc(z), String(a.length), [...new Set(a.map((x) => x.type))].join(", "),
      a.filter((x) => x.ipAddress).map((x) => x.ipAddress).join(", ") || "—",
    ]),
  );

  if (counts.total > 0) {
    html += `<h2>6. Security Implementation Status</h2>`;
    html += `<p>Pass rate: ${Math.round((counts.pass / counts.total) * 100)}% (${counts.pass}/${counts.total})</p>`;
  }

  return html;
}

function previewE26TST(hw: HwItem[]): string {
  let html = section("1. Purpose and Scope", `Ship cyber-resilience test procedure per IACS UR E26. Covers construction, commissioning, and annual survey testing for ${hw.length} CBS assets.`);

  html += section("2. Test Phases", "Three phases:", [
    "Phase 1 — Construction: Factory Acceptance Test (FAT)",
    "Phase 2 — Commissioning: Harbour (HAT) and Sea Acceptance Test (SAT)",
    "Phase 3 — Operation: Annual survey testing",
  ]);

  html += section("3. Commissioning Tests (HAT/SAT)", "Integrated vessel-level:", [
    "Zone boundary verification — firewall rules enforce segmentation",
    "Inter-system communication — only permitted flows exist",
    "Network monitoring — IDS captures expected events",
    "Incident response drill — simulate cyber incident",
    "Remote access test — crew approval, MFA, session timeout",
    "Backup/restore test — full restore of critical system",
    "Degraded mode test — vessel operates with degraded CBS",
  ]);

  html += section("4. Annual Survey Tests", "Classification society:", [
    "Security config spot-check",
    "Audit log review",
    "Account management review",
    "Backup verification",
    "Change management review",
    "Incident response readiness",
  ]);

  html += `<h2>5. Test Matrix</h2>`;
  html += table(
    ["Asset", "Type", "Zone", "FAT", "HAT", "SAT", "Annual"],
    hw.map((h) => [esc(h.name), esc(h.type), esc(h.zone || "—"), "[Date]", "[Date]", "[Date]", "[Date]"]),
  );

  return html;
}

// ─── Fallback for IEC/NIST/ISO ──────────────────────────────────────────────

function previewGeneric(docType: string, title: string, hw: HwItem[], sw: SwItem[], assessments: AssItem[]): string {
  const zones = groupBy(hw, (h) => h.zone || "Unassigned");
  const counts = { pass: 0, fail: 0, partial: 0, total: assessments.length };
  for (const a of assessments) {
    if (a.result === "PASS") counts.pass++;
    if (a.result === "FAIL") counts.fail++;
    if (a.result === "PARTIAL") counts.partial++;
  }

  let html = section(
    "1. Document Overview",
    `${title} — Covers ${hw.length} hardware and ${sw.length} software assets across ${zones.size} zone(s).`,
  );

  html += `<h2>2. CBS Summary</h2>`;
  html += table(["Metric", "Value"], [
    ["Hardware Assets", String(hw.length)],
    ["Software Components", String(sw.length)],
    ["Security Zones", String(zones.size)],
    ["Total Assessments", String(counts.total)],
    ["Pass Rate", counts.total > 0 ? `${Math.round((counts.pass / counts.total) * 100)}%` : "—"],
  ]);

  if (assessments.length > 0) {
    html += `<h2>3. Assessment Results</h2>`;
    html += table(
      ["Hardware", "Check", "Result", "Notes"],
      assessments.slice(0, 20).map((a) => [esc(a.hardware.name), esc(a.checkId), badge(a.result), esc(a.note || "—")]),
    );
    if (assessments.length > 20) {
      html += `<p style="color:#8D8D8D;font-size:12px">Showing 20 of ${assessments.length} assessment results. Download the full document for complete details.</p>`;
    }
  }

  return html;
}

// ─── Route dispatcher ───────────────────────────────────────────────────────

function buildPreview(
  docType: string,
  title: string,
  project: ProjectCtx,
  hw: HwItem[],
  sw: SwItem[],
  assessments: AssItem[],
): string {
  switch (docType) {
    case "E27-CBS":  return previewCBS(hw);
    case "E27-SBOM": return previewSBOM(sw);
    case "E27-AUD":  return previewAUD(hw, assessments);
    case "E27-TOP":  return previewTOP(hw);
    case "E27-VUL":  return previewVUL(hw, sw, assessments);
    case "E27-ACC":  return previewACC(hw, assessments);
    case "E27-MON":  return previewMON(hw, assessments);
    case "E26-ZCD":  return previewE26SZD(hw);
    case "E26-INV":  return previewE26INV(hw, sw);
    case "E26-CRA":  return previewE26CRA(hw, sw, assessments);
    default:         return previewGeneric(docType, title, hw, sw, assessments);
  }
}

function wrapHtml(
  project: ProjectCtx,
  doc: { docType: string; title: string; version: number },
  body: string,
): string {
  const date = new Date().toISOString().slice(0, 10);
  const standard = doc.docType.startsWith("E26") ? "IACS UR E26" : doc.docType.startsWith("E27") ? "IACS UR E27" : "Compliance";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(doc.docType)} - ${esc(doc.title)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #161616; line-height: 1.6; padding: 40px;
      max-width: 1000px; margin: 0 auto;
    }
    @media print { body { padding: 20px; } .no-print { display: none !important; } }
    .cover {
      text-align: center; padding: 80px 0 40px;
      border-bottom: 3px solid #0F62FE; margin-bottom: 40px;
    }
    .cover .doc-code { font-size: 14px; color: #0F62FE; font-weight: 600; letter-spacing: 2px; }
    .cover h1 { font-size: 32px; font-weight: 800; margin: 12px 0 24px; }
    .cover .meta { font-size: 14px; color: #525252; }
    .cover .meta span { display: block; margin: 4px 0; }
    h2 { font-size: 20px; font-weight: 700; margin: 32px 0 12px; padding-bottom: 6px; border-bottom: 2px solid #EDF5FF; }
    h3 { font-size: 16px; font-weight: 600; margin: 24px 0 8px; }
    p { margin: 8px 0; font-size: 14px; color: #525252; }
    ul { margin: 8px 0 16px 24px; font-size: 14px; color: #525252; }
    li { margin: 4px 0; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0 24px; font-size: 13px; }
    th, td { border: 1px solid #C6C6C6; padding: 8px 12px; text-align: left; }
    th { background: #EDF5FF; font-weight: 600; color: #161616; font-size: 12px; }
    td { color: #525252; }
    tr:nth-child(even) { background: #fafafa; }
    .footer { text-align: center; padding-top: 24px; border-top: 1px solid #C6C6C6; margin-top: 40px; font-size: 12px; color: #8D8D8D; }
    .print-btn {
      position: fixed; top: 20px; right: 20px; background: #0F62FE; color: white;
      border: none; padding: 10px 20px; border-radius: 8px; font-size: 14px;
      font-weight: 600; cursor: pointer; z-index: 1000; box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    }
    .print-btn:hover { background: #0043CE; }
    @media print {
      .no-print { display: none !important; }
      body { padding: 20px; }
      tr { break-inside: avoid; }
      td, th { break-inside: avoid; }
      table { break-inside: auto; }
      .section { break-inside: avoid; }
      h2, h3 { break-after: avoid; }
    }
  </style>
</head>
<body>
  <button class="print-btn no-print" onclick="window.print()">Print / Save as PDF</button>

  <div class="cover">
    <div class="doc-code">${esc(doc.docType)}</div>
    <h1>${esc(doc.title)}</h1>
    <div class="meta">
      <span>Vessel: ${esc(project.vesselName)}</span>
      ${project.systemName ? `<span>System: ${esc(project.systemName)}</span>` : ""}
      ${project.classification ? `<span>Classification: ${esc(project.classification)}</span>` : ""}
      ${project.shipowner ? `<span>Ship Owner: ${esc(project.shipowner)}</span>` : ""}
      <span>Version: v${doc.version} | Generated: ${date}</span>
      <span style="margin-top:8px;color:#0F62FE;font-weight:600">${esc(standard)} Compliance</span>
    </div>
  </div>

  ${body}

  <div class="footer">
    <p>Generated by SCS Platform v13 &mdash; ${esc(standard)} Compliance</p>
    <p>${date}</p>
  </div>
</body>
</html>`;
}

// ─── GET handler ────────────────────────────────────────────────────────────

export async function GET(_request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { projectId, documentId } = await params;
  const hasAccess = await verifyProjectAccess(user.id, projectId, user.role, user.shipyardId);
  if (!hasAccess) return apiError("Forbidden", 403);

  const document = await prisma.document.findFirst({
    where: { id: documentId, submission: { projectId } },
    include: { submission: { select: { projectId: true } } },
  });

  if (!document) return apiError("Document not found", 404);

  const [project, hardware, software, assessments] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId } }),
    prisma.hardware.findMany({
      where: { projectId },
      include: { software: { select: { id: true, name: true, version: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.software.findMany({
      where: { projectId },
      include: {
        hardware: { select: { id: true, name: true } },
        _count: { select: { cveMatches: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.assessment.findMany({
      where: { hardware: { projectId } },
      include: { hardware: { select: { id: true, name: true, type: true } } },
      orderBy: [{ hardware: { name: "asc" } }, { checkId: "asc" }],
    }),
  ]);

  if (!project) return apiError("Project not found", 404);

  const projectCtx: ProjectCtx = {
    vesselName: project.vesselName,
    shipowner: project.shipowner,
    classification: project.classification,
    systemName: project.systemName,
  };

  const body = buildPreview(
    document.docType,
    document.title,
    projectCtx,
    hardware as HwItem[],
    software as SwItem[],
    assessments as AssItem[],
  );

  const html = wrapHtml(projectCtx, {
    docType: document.docType,
    title: document.title,
    version: document.version,
  }, body);

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
