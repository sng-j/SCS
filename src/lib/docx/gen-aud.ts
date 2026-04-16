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

  const executiveSummary = [
    heading1("1. Executive Summary"),
    bodyText(
      `This report presents the results of the IACS UR E27 security configuration assessment ` +
      `for vessel "${project.vesselName}". The assessment covers ${hardware.length} hardware asset(s) ` +
      `across ${E27_SC_CHECKS.length} security configuration checks (SC).`,
    ),
    bodyText(`Overall Compliance Rate: ${complianceRate}%`),
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

  return wrapDocument("E27-AUD: Security Audit Report", project, [
    ...cover,
    ...executiveSummary,
    ...detailSections,
    ...findings,
  ]);
}
