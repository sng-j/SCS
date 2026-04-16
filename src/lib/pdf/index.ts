/**
 * PDF document generator using PDFKit.
 * Generates compliance documents in PDF format.
 */
import PDFDocument from "pdfkit";
import { prisma } from "@/lib/prisma";

interface ProjectContext {
  vesselName: string;
  shipowner: string | null;
  classification: string | null;
  systemName: string | null;
}

interface HardwareRow {
  id: string;
  name: string;
  type: string;
  manufacturer: string | null;
  model: string | null;
  ipAddress: string | null;
  zone: string | null;
}

interface SoftwareRow {
  id: string;
  name: string;
  version: string | null;
  vendor: string | null;
  swType: string;
  hardware: { name: string } | null;
}

interface AssessmentRow {
  checkId: string;
  result: string;
  evidence: string | null;
  hardware: { name: string; type: string };
}

// ─── Data fetching (shared with docx) ───────────────────────────────────────

async function fetchDocumentData(projectId: string) {
  const [project, hardware, software, assessments] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId } }),
    prisma.hardware.findMany({
      where: { projectId },
      orderBy: { name: "asc" },
    }),
    prisma.software.findMany({
      where: { projectId },
      include: { hardware: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.assessment.findMany({
      where: { hardware: { projectId } },
      include: { hardware: { select: { name: true, type: true } } },
      orderBy: [{ hardware: { name: "asc" } }, { checkId: "asc" }],
    }),
  ]);

  if (!project) throw new Error("Project not found");

  return {
    project: project as unknown as ProjectContext,
    hardware: hardware as unknown as HardwareRow[],
    software: software as unknown as SoftwareRow[],
    assessments: assessments as unknown as AssessmentRow[],
  };
}

// ─── PDF Generation ─────────────────────────────────────────────────────────

const BRAND_COLOR = "#0F62FE";
const TEXT_COLOR = "#161616";
const MUTED_COLOR = "#6F6F6F";

function addHeader(doc: PDFKit.PDFDocument, title: string, project: ProjectContext) {
  // Title bar
  doc.rect(0, 0, doc.page.width, 80).fill(BRAND_COLOR);
  doc.fontSize(18).fillColor("#ffffff").text(title, 50, 25, { width: doc.page.width - 100 });
  doc.fontSize(10).fillColor("#ffffffCC").text(
    `${project.vesselName}${project.classification ? ` | ${project.classification}` : ""}`,
    50, 50,
    { width: doc.page.width - 100 },
  );
  doc.fillColor(TEXT_COLOR);
  doc.y = 100;
}

function addSectionTitle(doc: PDFKit.PDFDocument, title: string) {
  doc.moveDown(0.5);
  doc.fontSize(13).fillColor(BRAND_COLOR).text(title);
  doc.moveTo(50, doc.y + 2).lineTo(doc.page.width - 50, doc.y + 2).stroke(BRAND_COLOR);
  doc.moveDown(0.3);
  doc.fillColor(TEXT_COLOR).fontSize(10);
}

function addParagraph(doc: PDFKit.PDFDocument, text: string) {
  doc.fontSize(10).fillColor(TEXT_COLOR).text(text, { align: "left", lineGap: 3 });
  doc.moveDown(0.3);
}

function addTableRow(doc: PDFKit.PDFDocument, cells: string[], widths: number[], isHeader = false) {
  const startX = 50;
  const startY = doc.y;
  const rowHeight = 20;

  if (isHeader) {
    doc.rect(startX, startY, widths.reduce((a, b) => a + b, 0), rowHeight).fill("#F4F4F4");
    doc.fillColor(TEXT_COLOR);
  }

  let x = startX;
  for (let i = 0; i < cells.length; i++) {
    doc.fontSize(isHeader ? 9 : 9)
      .fillColor(isHeader ? MUTED_COLOR : TEXT_COLOR)
      .text(cells[i] || "—", x + 4, startY + 5, { width: widths[i] - 8, ellipsis: true });
    x += widths[i];
  }
  doc.y = startY + rowHeight;
}

/**
 * Generate a PDF buffer for the given document type.
 */
export async function generatePdf(
  projectId: string,
  docType: string,
  docTitle: string,
): Promise<Buffer> {
  const data = await fetchDocumentData(projectId);

  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 50, bottom: 50, left: 50, right: 50 },
    info: {
      Title: docTitle,
      Author: "SCS v13 — Ship Equipment Cybersecurity Compliance Assessment System Support System",
      Subject: `${docType} for ${data.project.vesselName}`,
    },
  });

  const chunks: Uint8Array[] = [];
  doc.on("data", (chunk: Uint8Array) => chunks.push(chunk));

  addHeader(doc, docTitle, data.project);

  // Project info
  addSectionTitle(doc, "Project Information");
  addParagraph(doc, `Vessel: ${data.project.vesselName}`);
  if (data.project.shipowner) addParagraph(doc, `Shipowner: ${data.project.shipowner}`);
  if (data.project.classification) addParagraph(doc, `Classification Society: ${data.project.classification}`);
  addParagraph(doc, `Generated: ${new Date().toISOString().split("T")[0]}`);

  // Hardware inventory section
  if (data.hardware.length > 0) {
    addSectionTitle(doc, `Hardware Inventory (${data.hardware.length} items)`);
    const hw_widths = [140, 80, 100, 80, 90];
    addTableRow(doc, ["Name", "Type", "Manufacturer", "IP Address", "Zone"], hw_widths, true);
    for (const hw of data.hardware) {
      if (doc.y > doc.page.height - 80) doc.addPage();
      addTableRow(doc, [hw.name, hw.type, hw.manufacturer || "", hw.ipAddress || "", hw.zone || ""], hw_widths);
    }
  }

  // Software inventory section
  if (data.software.length > 0) {
    doc.addPage();
    addSectionTitle(doc, `Software Inventory (${data.software.length} items)`);
    const sw_widths = [130, 70, 90, 80, 120];
    addTableRow(doc, ["Name", "Type", "Vendor", "Version", "Installed On"], sw_widths, true);
    for (const sw of data.software) {
      if (doc.y > doc.page.height - 80) doc.addPage();
      addTableRow(doc, [sw.name, sw.swType, sw.vendor || "", sw.version || "", sw.hardware?.name || ""], sw_widths);
    }
  }

  // Assessment summary
  if (data.assessments.length > 0) {
    doc.addPage();
    addSectionTitle(doc, "Assessment Summary");
    const totalChecks = data.assessments.length;
    const passed = data.assessments.filter((a) => a.result === "PASS").length;
    const failed = data.assessments.filter((a) => a.result === "FAIL").length;
    const partial = data.assessments.filter((a) => a.result === "PARTIAL").length;

    addParagraph(doc, `Total Checks: ${totalChecks}`);
    addParagraph(doc, `Passed: ${passed} | Failed: ${failed} | Partial: ${partial}`);
    addParagraph(doc, `Compliance Rate: ${totalChecks > 0 ? ((passed / totalChecks) * 100).toFixed(1) : 0}%`);

    doc.moveDown(0.5);
    const a_widths = [120, 80, 70, 220];
    addTableRow(doc, ["Hardware", "Check ID", "Result", "Evidence"], a_widths, true);
    for (const a of data.assessments) {
      if (doc.y > doc.page.height - 80) doc.addPage();
      addTableRow(doc, [a.hardware.name, a.checkId, a.result, a.evidence || ""], a_widths);
    }
  }

  // Footer
  const pageCount = doc.bufferedPageRange().count;
  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i);
    doc.fontSize(8).fillColor(MUTED_COLOR)
      .text(
        `SCS v13 — ${docType} — Page ${i + 1} of ${pageCount}`,
        50,
        doc.page.height - 40,
        { align: "center", width: doc.page.width - 100 },
      );
  }

  doc.end();

  return new Promise<Buffer>((resolve) => {
    doc.on("end", () => {
      resolve(Buffer.concat(chunks));
    });
  });
}
