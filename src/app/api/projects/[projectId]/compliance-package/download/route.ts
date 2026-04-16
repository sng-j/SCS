import { prisma } from "@/lib/prisma";
import {
  getSessionUser,
  verifyProjectAccess,
  apiError,
} from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ projectId: string }>;
}

/** GET /api/projects/[projectId]/compliance-package/download?id=xxx */
export async function GET(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { projectId } = await params;
  const hasAccess = await verifyProjectAccess(user.id, projectId, user.role, user.shipyardId);
  if (!hasAccess) return apiError("Forbidden", 403);

  const { searchParams } = new URL(request.url);
  const pkgId = searchParams.get("id");
  if (!pkgId) return apiError("id is required", 400);

  const pkg = await prisma.compliancePackage.findFirst({
    where: { id: pkgId, projectId },
  });
  if (!pkg) return apiError("Package not found", 404);

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { vesselName: true, classification: true, systemName: true },
  });

  // Fetch E27 assessment details
  const assessments = await prisma.assessment.findMany({
    where: { hardware: { projectId }, standard: { contains: pkg.standard } },
    select: {
      checkId: true,
      standard: true,
      result: true,
      note: true,
      hardware: { select: { name: true, type: true, zone: true } },
    },
    orderBy: [{ hardware: { name: "asc" } }, { checkId: "asc" }],
  });

  // Fetch SBOM
  const software = await prisma.software.findMany({
    where: { projectId },
    select: { name: true, version: true, vendor: true },
    orderBy: { name: "asc" },
    take: 100,
  });
  const totalSw = await prisma.software.count({ where: { projectId } });

  // Fetch CVE matches with severity from CveLocal
  const cveMatches = await prisma.cveMatch.findMany({
    where: { software: { projectId } },
    select: { cveId: true, software: { select: { name: true } } },
    take: 50,
  });
  const cveIds = [...new Set(cveMatches.map((c) => c.cveId))];
  const cveDetails = cveIds.length > 0
    ? await prisma.cveLocal.findMany({
        where: { cveId: { in: cveIds } },
        select: { cveId: true, baseSeverity: true, baseScore: true },
      })
    : [];
  const cveMap = new Map(cveDetails.map((c) => [c.cveId, c]));

  const enrichedCves = cveMatches.map((m) => {
    const detail = cveMap.get(m.cveId);
    return {
      cveId: m.cveId,
      severity: detail?.baseSeverity || null,
      score: detail?.baseScore || null,
      softwareName: m.software?.name || "",
    };
  }).sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 30);

  const cveCritical = enrichedCves.filter((c) => c.severity === "CRITICAL").length;
  const cveHigh = enrichedCves.filter((c) => c.severity === "HIGH").length;

  const vesselName = project?.vesselName || "Unknown Vessel";

  const html = generateComplianceHtml({
    vesselName,
    classification: project?.classification || "",
    systemName: project?.systemName || "",
    standard: pkg.standard,
    score: pkg.score,
    checksPassed: pkg.checksPassed,
    checksTotal: pkg.checksTotal,
    signature: pkg.signature || "",
    generatedAt: pkg.generatedAt.toISOString(),
    signedBy: pkg.signedBy || user.email,
    signedByOrg: pkg.signedByOrg || "",
    assessments: assessments.map((a) => ({
      checkId: a.checkId,
      result: a.result,
      note: a.note || "",
      deviceName: a.hardware.name,
    })),
    software,
    totalSw,
    cveMatches: enrichedCves,
    cveCritical,
    cveHigh,
  });

  const safeName = vesselName.replace(/[^a-zA-Z0-9_-]/g, "_");
  const dateStr = pkg.generatedAt.toISOString().split("T")[0].replace(/-/g, "");

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${pkg.standard}_Compliance_${safeName}_${dateStr}.html"`,
    },
  });
}

// ─── HTML Report Generator ───────────────────────────────────────────────────

function generateComplianceHtml(data: {
  vesselName: string;
  classification: string;
  systemName: string;
  standard: string;
  score: number;
  checksPassed: number;
  checksTotal: number;
  signature: string;
  generatedAt: string;
  signedBy: string;
  signedByOrg: string;
  assessments: { checkId: string; result: string; note: string; deviceName: string }[];
  software: { name: string; version: string | null; vendor: string | null }[];
  totalSw: number;
  cveMatches: { cveId: string; severity: string | null; score: number | null; softwareName: string }[];
  cveCritical: number;
  cveHigh: number;
}): string {
  const pct = data.checksTotal > 0 ? Math.round((data.checksPassed / data.checksTotal) * 100) : 0;
  const scoreColor = pct >= 80 ? "#059669" : pct >= 60 ? "#d97706" : "#dc2626";
  const dateStr = new Date(data.generatedAt).toLocaleString("en-US", {
    year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
  });

  const e27Rows = data.assessments.map((a) => {
    const icon = a.result === "PASS" ? "&#x2705;" : a.result === "FAIL" ? "&#x274C;" : "&#x2796;";
    const bg = a.result === "PASS" ? "#f0fdf4" : a.result === "FAIL" ? "#fef2f2" : "#fafafa";
    return `<tr style="background:${bg};"><td style="padding:6px 8px;">${icon}</td><td style="padding:6px 8px;font-size:12px;">${esc(a.deviceName)}</td><td style="padding:6px 8px;font-size:12px;color:#374151;">${esc(a.checkId)}</td><td style="padding:6px 8px;font-size:12px;">${a.result}</td><td style="padding:6px 8px;font-size:11px;color:#6b7280;">${esc(a.note)}</td></tr>`;
  }).join("\n");

  const sbomRows = data.software.map((s) =>
    `<tr><td style="padding:4px 8px;font-size:11px;">${esc(s.name)}</td><td style="padding:4px 8px;font-size:11px;color:#6b7280;">${esc(s.version || "")}</td><td style="padding:4px 8px;font-size:11px;color:#94a3b8;">${esc(s.vendor || "")}</td></tr>`
  ).join("\n");
  const extraSbom = data.totalSw > 100
    ? `<tr><td colspan="3" style="padding:6px;text-align:center;color:#6b7280;font-size:11px;">... and ${data.totalSw - 100} more</td></tr>`
    : "";

  const cveRows = data.cveMatches.map((c) => {
    const sevColor = c.severity === "CRITICAL" ? "#7c1d1d" : c.severity === "HIGH" ? "#dc2626" : c.severity === "MEDIUM" ? "#ea580c" : "#059669";
    return `<tr><td style="padding:4px 8px;font-size:11px;font-family:monospace;">${esc(c.cveId)}</td><td style="padding:4px 8px;font-size:11px;color:${sevColor};font-weight:700;">${c.severity || "N/A"}</td><td style="padding:4px 8px;font-size:11px;">${c.score != null ? c.score.toFixed(1) : "-"}</td><td style="padding:4px 8px;font-size:11px;color:#6b7280;">${esc(c.softwareName)}</td></tr>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>${esc(data.standard)} Compliance Package — ${esc(data.vesselName)}</title>
<style>
body{font-family:'Segoe UI',system-ui,sans-serif;margin:0;padding:24px;color:#1e293b;background:#f8fafc;}
.header{background:linear-gradient(135deg,#0f172a,#1e3a5f);color:#fff;border-radius:12px;padding:28px 32px;margin-bottom:24px;}
.header h1{font-size:20px;font-weight:800;margin:0 0 4px;}
.header .sub{font-size:13px;color:#94a3b8;}
.score-circle{width:80px;height:80px;border-radius:50%;border:6px solid ${scoreColor};display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:900;color:${scoreColor};background:#fff;float:right;margin-top:-10px;}
.section{background:#fff;border-radius:10px;border:1px solid #e2e8f0;padding:20px 24px;margin-bottom:20px;}
.section h2{font-size:15px;font-weight:700;color:#0f172a;margin:0 0 14px;padding-bottom:8px;border-bottom:2px solid #e2e8f0;}
.meta-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:4px;}
.meta-item{background:#f8fafc;border-radius:8px;padding:12px 14px;}
.meta-label{font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;}
.meta-value{font-size:14px;font-weight:700;color:#0f172a;margin-top:2px;}
table{width:100%;border-collapse:collapse;}
th{background:#f0f3f8;padding:8px;font-size:12px;font-weight:700;color:#374151;text-align:left;}
.hash{font-family:monospace;font-size:10px;color:#6b7280;background:#f1f5f9;padding:8px 12px;border-radius:6px;word-break:break-all;}
.seal{border:3px double #2563eb;border-radius:10px;padding:16px;text-align:center;color:#1d4ed8;margin-top:16px;}
@media print{body{padding:10px;}.section{break-inside:avoid;}}
</style>
</head>
<body>
<div class="header">
  <div class="score-circle">${pct}%</div>
  <div style="font-size:11px;font-weight:700;color:#60a5fa;letter-spacing:2px;margin-bottom:4px;">IACS UR ${esc(data.standard)} COMPLIANCE PACKAGE</div>
  <h1>${esc(data.vesselName)}</h1>
  <div class="sub">${esc(data.systemName)}${data.classification ? ` &middot; ${esc(data.classification)}` : ""} &middot; ${dateStr}</div>
</div>

<div class="section">
  <h2>Compliance Summary</h2>
  <div class="meta-grid">
    <div class="meta-item"><div class="meta-label">${esc(data.standard)} Score</div><div class="meta-value" style="color:${scoreColor};">${pct}% (${data.checksPassed}/${data.checksTotal})</div></div>
    <div class="meta-item"><div class="meta-label">SBOM Components</div><div class="meta-value">${data.totalSw}</div></div>
    <div class="meta-item"><div class="meta-label">CVE Critical / High</div><div class="meta-value" style="color:${data.cveCritical > 0 ? "#dc2626" : data.cveHigh > 0 ? "#ea580c" : "#059669"};">${data.cveCritical} / ${data.cveHigh}</div></div>
  </div>
</div>

<div class="section">
  <h2>${esc(data.standard)} Hardening Check Results</h2>
  <table><thead><tr><th width="40">Pass</th><th>Device</th><th width="100">Check</th><th width="60">Result</th><th>Notes</th></tr></thead>
  <tbody>${e27Rows || '<tr><td colspan="5" style="padding:12px;text-align:center;color:#6b7280;">No assessment data</td></tr>'}</tbody></table>
</div>

${data.software.length > 0 ? `<div class="section">
  <h2>SBOM &mdash; Software Bill of Materials${data.totalSw > 100 ? ` (Top 100 of ${data.totalSw})` : ""}</h2>
  <table><thead><tr><th>Name</th><th>Version</th><th>Vendor</th></tr></thead>
  <tbody>${sbomRows}${extraSbom}</tbody></table>
</div>` : ""}

${data.cveMatches.length > 0 ? `<div class="section">
  <h2>CVE Vulnerability Summary (Top 30)</h2>
  <table><thead><tr><th>CVE ID</th><th>Severity</th><th>Score</th><th>Affected Software</th></tr></thead>
  <tbody>${cveRows}</tbody></table>
</div>` : ""}

<div class="section">
  <h2>Digital Seal</h2>
  <div class="hash">Package Hash (SHA-256): ${esc(data.signature)}</div>
  <div class="seal">
    <div style="font-size:28px;margin-bottom:4px;">&#9875;</div>
    <div style="font-weight:800;font-size:15px;">SCS Maritime Cyber Security</div>
    <div style="font-size:13px;margin-top:4px;">This package was generated and digitally signed by ${esc(data.signedBy)}${data.signedByOrg ? ` (${esc(data.signedByOrg)})` : ""}</div>
    <div style="font-size:12px;color:#6b7280;margin-top:2px;">${dateStr} &middot; IACS UR ${esc(data.standard)} &middot; IEC 62443-3-3</div>
  </div>
</div>
</body></html>`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
