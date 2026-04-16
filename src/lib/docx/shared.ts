/**
 * Shared docx building blocks for all E27 document generators.
 */
import {
  Document,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  WidthType,
  ShadingType,
  PageBreak,
  Footer,
  Header,
  type ISectionOptions,
} from "docx";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ProjectContext {
  id: string;
  vesselName: string;
  shipowner: string | null;
  classification: string | null;
  systemName: string | null;
}

export interface HardwareRow {
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
  _count: { cveMatches: number; assessments: number };
}

export interface SoftwareRow {
  id: string;
  name: string;
  version: string | null;
  vendor: string | null;
  swType: string;
  cpe: string | null;
  hardware: { id: string; name: string } | null;
  _count: { cveMatches: number };
}

export interface AssessmentRow {
  id: string;
  hardwareId: string;
  checkId: string;
  standard: string;
  result: string;
  evidence: string | null;
  note: string | null;
  hardware: { id: string; name: string; type: string };
}

// ─── Style constants ────────────────────────────────────────────────────────

const BRAND_COLOR = "0F62FE";
const HEADER_BG = "EDF5FF";
const BORDER_COLOR = "C6C6C6";

const TABLE_BORDER = {
  style: BorderStyle.SINGLE,
  size: 1,
  color: BORDER_COLOR,
};

const TABLE_BORDERS = {
  top: TABLE_BORDER,
  bottom: TABLE_BORDER,
  left: TABLE_BORDER,
  right: TABLE_BORDER,
  insideHorizontal: TABLE_BORDER,
  insideVertical: TABLE_BORDER,
};

// ─── Cover page ─────────────────────────────────────────────────────────────

export function buildCoverPage(
  project: ProjectContext,
  docTitle: string,
  docCode: string,
): Paragraph[] {
  return [
    new Paragraph({ spacing: { before: 4000 } }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: docCode, size: 24, color: BRAND_COLOR, font: "Arial" }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200 },
      children: [
        new TextRun({ text: docTitle, size: 48, bold: true, font: "Arial" }),
      ],
    }),
    new Paragraph({ spacing: { before: 600 } }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: `Vessel: ${project.vesselName}`, size: 28, color: "525252" }),
      ],
    }),
    ...(project.systemName
      ? [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: `System: ${project.systemName}`, size: 24, color: "525252" }),
            ],
          }),
        ]
      : []),
    ...(project.classification
      ? [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: `Classification: ${project.classification}`, size: 24, color: "525252" }),
            ],
          }),
        ]
      : []),
    new Paragraph({ spacing: { before: 400 } }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: `Generated: ${new Date().toISOString().slice(0, 10)}`,
          size: 20,
          color: "8D8D8D",
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: "IACS UR E27 Compliance", size: 20, color: "8D8D8D" }),
      ],
    }),
    new Paragraph({
      children: [new PageBreak()],
    }),
  ];
}

// ─── Section heading ────────────────────────────────────────────────────────

export function heading1(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 200 },
    children: [new TextRun({ text, bold: true, size: 32, color: "161616" })],
  });
}

export function heading2(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 150 },
    children: [new TextRun({ text, bold: true, size: 26, color: "161616" })],
  });
}

export function bodyText(text: string): Paragraph {
  return new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text, size: 22, color: "525252" })],
  });
}

export function bulletItem(text: string): Paragraph {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 60 },
    children: [new TextRun({ text, size: 22 })],
  });
}

// ─── Data table ─────────────────────────────────────────────────────────────

export function buildTable(
  headers: string[],
  rows: string[][],
  colWidths?: number[],
): Table {
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map(
      (h, i) =>
        new TableCell({
          width: colWidths?.[i]
            ? { size: colWidths[i], type: WidthType.DXA }
            : undefined,
          shading: { type: ShadingType.SOLID, color: HEADER_BG },
          children: [
            new Paragraph({
              spacing: { before: 40, after: 40 },
              children: [new TextRun({ text: h, bold: true, size: 20, color: "161616" })],
            }),
          ],
        }),
    ),
  });

  const dataRows = rows.map(
    (cells) =>
      new TableRow({
        children: cells.map(
          (cell, i) =>
            new TableCell({
              width: colWidths?.[i]
                ? { size: colWidths[i], type: WidthType.DXA }
                : undefined,
              children: [
                new Paragraph({
                  spacing: { before: 30, after: 30 },
                  children: [new TextRun({ text: cell || "—", size: 20, color: "525252" })],
                }),
              ],
            }),
        ),
      }),
  );

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: TABLE_BORDERS,
    rows: [headerRow, ...dataRows],
  });
}

// ─── Result badge text ──────────────────────────────────────────────────────

const RESULT_LABELS: Record<string, string> = {
  PASS: "PASS",
  FAIL: "FAIL",
  PARTIAL: "PARTIAL",
  NOT_APPLICABLE: "N/A",
  NOT_CHECKED: "NOT CHECKED",
};

export function resultLabel(result: string): string {
  return RESULT_LABELS[result] || result;
}

// ─── Document wrapper ───────────────────────────────────────────────────────

export function wrapDocument(
  title: string,
  project: ProjectContext,
  children: (Paragraph | Table)[],
): Document {
  return new Document({
    title,
    creator: "SCS Platform v13",
    description: `${title} — ${project.vesselName}`,
    sections: [
      {
        properties: {},
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({ text: `${project.vesselName} — ${title}`, size: 16, color: "8D8D8D", italics: true }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: "Generated by SCS Platform — IACS UR E27 Compliance", size: 14, color: "8D8D8D" }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
}
