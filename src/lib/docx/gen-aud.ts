/**
 * E27-AUD: Security Audit Report
 * Assessment results grouped by hardware, with SC check details.
 */
import type { Document, Paragraph, Table } from "docx";
import type { DocumentData } from "./index";
import { E27_SC_CHECKS } from "@/lib/constants";
import {
  buildCoverPage,
  heading1,
  heading2,
  bodyText,
  bulletItem,
  buildTable,
  resultLabel,
  wrapDocument,
} from "./shared";

export function generateAUD(data: DocumentData): Document {
  const { project, hardware, assessments } = data;

  const cover = buildCoverPage(project, "Security Audit Report", "E27-AUD");

  // Statistics
  const total = assessments.length;
  const pass = assessments.filter((a) => a.result === "PASS").length;
  const fail = assessments.filter((a) => a.result === "FAIL").length;
  const partial = assessments.filter((a) => a.result === "PARTIAL").length;
  const na = assessments.filter((a) => a.result === "NOT_APPLICABLE").length;
  const unchecked = assessments.filter((a) => a.result === "NOT_CHECKED").length;
  const complianceRate = total > 0 ? Math.round(((pass + na) / total) * 100) : 0;

  const verdict = complianceRate >= 90 ? "Satisfactory" : complianceRate >= 70 ? "Conditional" : "Unsatisfactory";

  const executiveSummary = [
    heading1("1. Executive Summary"),
    bodyText(
      `This report presents the results of the IACS UR E27 security configuration assessment ` +
      `for vessel "${project.vesselName}". The assessment covers ${hardware.length} hardware asset(s) ` +
      `across ${E27_SC_CHECKS.length} security configuration checks (SC).`,
    ),
    bodyText(`Overall Compliance Rate: ${complianceRate}% — Assessment Verdict: ${verdict}`),
    buildTable(
      ["Result", "Count", "Percentage"],
      [
        ["PASS", String(pass), total > 0 ? `${Math.round((pass / total) * 100)}%` : "0%"],
        ["FAIL", String(fail), total > 0 ? `${Math.round((fail / total) * 100)}%` : "0%"],
        ["PARTIAL", String(partial), total > 0 ? `${Math.round((partial / total) * 100)}%` : "0%"],
        ["N/A", String(na), total > 0 ? `${Math.round((na / total) * 100)}%` : "0%"],
        ["NOT CHECKED", String(unchecked), total > 0 ? `${Math.round((unchecked / total) * 100)}%` : "0%"],
      ],
    ),
  ];

  // Per-hardware results
  const detailSections: (Paragraph | Table)[] = [];
  const hwWithAssessments = hardware.filter((hw) =>
    assessments.some((a) => a.hardwareId === hw.id),
  );

  detailSections.push(heading1("2. Detailed Assessment Results"));

  hwWithAssessments.forEach((hw, idx) => {
    const hwAssessments = assessments.filter((a) => a.hardwareId === hw.id);

    detailSections.push(heading2(`2.${idx + 1} ${hw.name} (${hw.type})`));
    detailSections.push(
      bodyText(`Location: ${hw.location || "N/A"} | Zone: ${hw.zone || "N/A"} | IP: ${hw.ipAddress || "N/A"}`),
    );

    detailSections.push(
      buildTable(
        ["Check ID", "Title", "Result", "Evidence", "Notes"],
        hwAssessments.map((a) => {
          const check = E27_SC_CHECKS.find((c) => c.id === a.checkId);
          return [
            a.checkId,
            check?.title || a.checkId,
            resultLabel(a.result),
            a.evidence || "",
            a.note || "",
          ];
        }),
      ),
    );
  });

  // Findings & recommendations
  const failItems = assessments.filter((a) => a.result === "FAIL" || a.result === "PARTIAL");
  const findings: (Paragraph | Table)[] = [
    heading1("3. Findings & Recommendations"),
  ];

  if (failItems.length === 0) {
    findings.push(bodyText("No critical findings. All assessed items have passed or are not applicable."));
  } else {
    findings.push(bodyText(`${failItems.length} item(s) require attention:`));
    failItems.forEach((a) => {
      const hw = hardware.find((h) => h.id === a.hardwareId);
      const check = E27_SC_CHECKS.find((c) => c.id === a.checkId);
      findings.push(
        bulletItem(
          `${hw?.name || "Unknown"} — ${a.checkId} (${check?.title || ""}): ${resultLabel(a.result)}` +
          (a.note ? ` — ${a.note}` : ""),
        ),
      );
    });
  }

  // 4. Failure Distribution by SC Category
  const categoryDist: (Paragraph | Table)[] = [heading1("4. Failure Distribution by Category")];
  const scCategories = new Map<string, { pass: number; fail: number; total: number }>();
  assessments.forEach((a) => {
    const cat = a.checkId.split("-").slice(0, 2).join("-"); // e.g., "SC-1"
    const entry = scCategories.get(cat) || { pass: 0, fail: 0, total: 0 };
    entry.total++;
    if (a.result === "PASS") entry.pass++;
    if (a.result === "FAIL" || a.result === "PARTIAL") entry.fail++;
    scCategories.set(cat, entry);
  });
  if (scCategories.size > 0) {
    categoryDist.push(buildTable(
      ["SC Category", "Total Checks", "Pass", "Fail/Partial", "Compliance %"],
      Array.from(scCategories.entries()).sort().map(([cat, c]) => [
        cat, String(c.total), String(c.pass), String(c.fail),
        c.total > 0 ? `${Math.round((c.pass / c.total) * 100)}%` : "N/A",
      ]),
    ));
  } else {
    categoryDist.push(bodyText("No assessment data available for distribution analysis."));
  }

  // 5. Remediation Recommendations
  const E27_REMEDIATION: Record<string, { priority: string; recommendation: string; ref: string }> = {
    "SC-1": { priority: "HIGH", recommendation: "Enforce password complexity via Group Policy (secpol.msc → Account Policies). Min 8 characters, complexity enabled, lockout threshold ≤5.", ref: "E27 SC-1" },
    "SC-2": { priority: "HIGH", recommendation: "Review and disable unused accounts. Run: Get-LocalUser | Where-Object {$_.Enabled} to list active accounts. Disable Guest: Disable-LocalUser -Name Guest.", ref: "E27 SC-2" },
    "SC-3": { priority: "MEDIUM", recommendation: "Restrict user privileges to minimum required. Remove users from local Administrators group. Implement application whitelisting.", ref: "E27 SC-3" },
    "SC-5": { priority: "CRITICAL", recommendation: "Disable SMBv1: Set-SmbServerConfiguration -EnableSMB1Protocol $false. Disable AutoRun via GPO. Block unused USB ports.", ref: "E27 SC-5" },
    "SC-6": { priority: "CRITICAL", recommendation: "Enable Windows Firewall on all profiles. Enable RDP NLA: Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Terminal Server\\WinStations\\RDP-Tcp' -Name UserAuthentication -Value 1.", ref: "E27 SC-6" },
    "SC-7": { priority: "HIGH", recommendation: "Enable audit logging for all categories (Success+Failure). Set Security log size ≥196 MB, Application ≥32 MB. Retain logs ≥90 days.", ref: "E27 SC-7" },
    "SC-8": { priority: "MEDIUM", recommendation: "Implement data integrity controls. Enable drive encryption (BitLocker) for removable media.", ref: "E27 SC-8" },
    "SC-9": { priority: "MEDIUM", recommendation: "Encrypt all remote administration and inter-zone communications. Use TLS 1.2+ for all network services.", ref: "E27 SC-9" },
    "SC-10": { priority: "HIGH", recommendation: "Configure screen lock timeout ≤15 minutes via GPO. Require Ctrl+Alt+Del for logon.", ref: "E27 SC-10" },
    "SC-11": { priority: "HIGH", recommendation: "Enable Windows Defender with real-time protection: Set-MpPreference -DisableRealtimeMonitoring $false. Update definitions daily.", ref: "E27 SC-11" },
    "SC-12": { priority: "MEDIUM", recommendation: "Restrict removable media usage. Block USB storage: Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\USBSTOR' -Name Start -Value 4.", ref: "E27 SC-12" },
    "SC-13": { priority: "HIGH", recommendation: "Establish patch management schedule. CAT I/II: vendor-approved patches annually. CAT III: automatic updates monthly. Critical patches (CVSS ≥9.0) within 30 days.", ref: "E27 SC-13" },
  };

  const remediations: (Paragraph | Table)[] = [heading1("5. Remediation Recommendations")];
  if (failItems.length === 0) {
    remediations.push(bodyText("No remediation actions required — all items passed."));
  } else {
    remediations.push(buildTable(
      ["Device", "Check ID", "Priority", "Remediation", "E27 Reference"],
      failItems.map((a) => {
        const hw = hardware.find((h) => h.id === a.hardwareId);
        const scKey = a.checkId.split("-").slice(0, 2).join("-");
        const rem = E27_REMEDIATION[scKey] || { priority: "MEDIUM", recommendation: "Review and address finding.", ref: a.checkId };
        return [hw?.name || "Unknown", a.checkId, rem.priority, rem.recommendation, rem.ref];
      }),
    ));
  }

  return wrapDocument("E27-AUD: Security Audit Report", project, [
    ...cover,
    ...executiveSummary,
    ...detailSections,
    ...findings,
    ...categoryDist,
    ...remediations,
  ]);
}
