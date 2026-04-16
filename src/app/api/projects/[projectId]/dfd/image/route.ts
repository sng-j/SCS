import { NextResponse } from "next/server";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { execFile } from "child_process";
import { prisma } from "@/lib/prisma";
import { getSessionUser, verifyProjectAccess, apiError } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

const ALLOWED_EXTENSIONS = new Set(["png", "jpg", "jpeg"]);
const ALLOWED_MIMES = new Set(["image/png", "image/jpeg"]);
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

interface Params {
  params: Promise<{ projectId: string }>;
}

/** Find python3 binary */
function findPython(): string | null {
  const candidates = [
    "/usr/bin/python3",
    "/usr/local/bin/python3",
    "/opt/homebrew/bin/python3",
  ];
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("fs");
  for (const p of candidates) {
    try {
      fs.accessSync(p, fs.constants.X_OK);
      return p;
    } catch {
      continue;
    }
  }
  return null;
}

/** Run Python script with JSON stdin, return parsed JSON stdout */
function runPython(
  pythonBin: string,
  scriptPath: string,
  stdinData: string,
): Promise<{ ok: boolean; output: unknown; stderr: string }> {
  return new Promise((resolve) => {
    const child = execFile(
      pythonBin,
      [scriptPath],
      {
        cwd: path.dirname(scriptPath),
        env: {
          ...process.env,
          PYTHONPATH: path.dirname(scriptPath),
          PYTHONIOENCODING: "utf-8",
        },
        maxBuffer: 10 * 1024 * 1024,
        timeout: 120_000,
      },
      (error, stdout, stderr) => {
        if (error) {
          resolve({ ok: false, output: null, stderr: stderr || error.message });
          return;
        }
        try {
          const parsed = JSON.parse(stdout);
          resolve({ ok: true, output: parsed, stderr: stderr || "" });
        } catch {
          resolve({ ok: false, output: stdout.slice(0, 500), stderr: stderr || "" });
        }
      },
    );
    if (child.stdin) {
      child.stdin.write(stdinData);
      child.stdin.end();
    }
  });
}

/** POST /api/projects/[projectId]/dfd/image — upload image & run OCR→DFD processor */
export async function POST(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { projectId } = await params;
  const hasAccess = await verifyProjectAccess(user.id, projectId, user.role, user.shipyardId);
  if (!hasAccess) return apiError("Forbidden", 403);

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file || typeof file === "string") {
      return apiError("No file provided", 400);
    }

    if (file.size > MAX_SIZE) {
      return apiError("File size exceeds 10MB limit", 400);
    }

    const originalName = file.name;
    const ext = originalName.split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return apiError(
        `Only image files allowed. Allowed types: ${[...ALLOWED_EXTENSIONS].join(", ")}`,
        400,
      );
    }

    if (!ALLOWED_MIMES.has(file.type)) {
      return apiError("File MIME type not allowed. Only PNG and JPEG images accepted.", 400);
    }

    // Write temp file for Python processor
    const tmpDir = path.join(process.cwd(), "tmp", "img_dfd");
    await mkdir(tmpDir, { recursive: true });
    const uniqueName = `dfd-${crypto.randomUUID()}.${ext}`;
    const tmpPath = path.join(tmpDir, uniqueName);

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await writeFile(tmpPath, buffer);

    // Also save to dfd-images directory for reference
    const { dfdImagesDir } = await import("@/lib/upload-dir");
    await mkdir(dfdImagesDir, { recursive: true });
    const publicPath = path.join(dfdImagesDir, uniqueName);
    await writeFile(publicPath, buffer);

    // Find Python
    const pythonBin = findPython();
    const scriptPath = path.join(process.cwd(), "scripts", "img_dfd_processor.py");

    // Check if Python + dependencies are available
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("fs");
    const hasPython = pythonBin && fs.existsSync(scriptPath);

    if (!hasPython) {
      // Fallback: save image but no OCR processing
      await unlink(tmpPath).catch(() => {});
      const imgTemplate = await prisma.imgTemplate.create({
        data: {
          name: originalName,
          category: "user_upload",
          data: JSON.stringify({
            projectId,
            originalName,
            filename: uniqueName,
            path: `/uploads/${uniqueName}`,
            mimeType: file.type,
            size: file.size,
            uploadedBy: user.id,
          }),
          phash: null,
        },
      });

      return NextResponse.json({
        id: imgTemplate.id,
        processed: false,
        message: "Image saved. Python3 or dependencies not available for OCR processing.",
        nodes: [],
        edges: [],
      });
    }

    // Fetch learning context (last 5 final DFD results from this user's project)
    const learnCtx: { final_count: number; device_types: string[] }[] = [];
    const pastLogs = await prisma.imgTemplate.findMany({
      where: { category: "user_upload" },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { data: true },
    });
    for (const log of pastLogs) {
      const d = typeof log.data === 'string' ? JSON.parse(log.data) as Record<string, unknown> | null : log.data as Record<string, unknown> | null;
      if (d?.finalNodes) {
        const fn = d.finalNodes as { type: string }[];
        learnCtx.push({
          final_count: fn.length,
          device_types: [...new Set(fn.map((n) => n.type))],
        });
      }
    }

    // Call Python processor
    const pyInput = JSON.stringify({
      image_path: tmpPath,
      learn_context: learnCtx,
    });

    const result = await runPython(pythonBin, scriptPath, pyInput);

    // Cleanup temp file
    await unlink(tmpPath).catch(() => {});

    if (!result.ok || !result.output) {
      return NextResponse.json({
        processed: false,
        message: `Processor error: ${result.stderr?.slice(0, 300) || "unknown"}`,
        nodes: [],
        edges: [],
      });
    }

    const pyResult = result.output as {
      ok: boolean;
      msg?: string;
      nodes?: unknown[];
      edges?: unknown[];
      nid?: number;
      eid?: number;
      summary?: string;
      confidence?: number;
      ocr_words?: number;
    };

    if (!pyResult.ok) {
      return NextResponse.json({
        processed: false,
        message: pyResult.msg || "Processing failed",
        nodes: [],
        edges: [],
      });
    }

    // Convert Python output nodes to React Flow format
    const rfNodes = (pyResult.nodes || []).map((n: unknown) => {
      const node = n as {
        id: number;
        type: string;
        name: string;
        x: number;
        y: number;
        hw?: Record<string, string>;
      };
      return {
        id: `img-${node.id}`,
        type: "hardwareNode",
        position: { x: node.x, y: node.y },
        data: {
          label: node.name,
          hwType: mapDeviceType(node.type),
          zone: "",
          ipAddress: node.hw?.ip_address || "",
          manufacturer: node.hw?.manufacturer || "",
          model: node.hw?.hw_model || "",
        },
      };
    });

    const rfEdges = (pyResult.edges || []).map((e: unknown) => {
      const edge = e as {
        id: number;
        from: number;
        to: number;
        medium?: string;
        protocol?: string;
      };
      return {
        id: `img-e-${edge.id}`,
        source: `img-${edge.from}`,
        target: `img-${edge.to}`,
        type: "smoothstep",
        animated: false,
        data: {
          type: edge.medium || "Ethernet",
          protocol: edge.protocol || "TCP/IP",
        },
      };
    });

    // Save ImgTemplate record with result
    const imgTemplate = await prisma.imgTemplate.create({
      data: {
        name: originalName,
        category: "user_upload",
        data: JSON.stringify({
          projectId,
          originalName,
          filename: uniqueName,
          path: `/uploads/${uniqueName}`,
          mimeType: file.type,
          size: file.size,
          uploadedBy: user.id,
          summary: pyResult.summary,
          confidence: pyResult.confidence,
          ocrWords: pyResult.ocr_words,
          nodesCount: rfNodes.length,
          edgesCount: rfEdges.length,
        }),
        phash: null,
      },
    });

    return NextResponse.json({
      id: imgTemplate.id,
      processed: true,
      summary: pyResult.summary || "",
      confidence: pyResult.confidence || 0,
      ocrWords: pyResult.ocr_words || 0,
      nodes: rfNodes,
      edges: rfEdges,
      message: `Detected ${rfNodes.length} devices, ${rfEdges.length} connections (confidence: ${Math.round((pyResult.confidence || 0) * 100)}%)`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to process image";
    return apiError(message, 500);
  }
}

/** Map v12 device types to v13 hardware types */
function mapDeviceType(v12Type: string): string {
  const map: Record<string, string> = {
    server: "SERVER",
    plc: "PLC",
    sensor: "SENSOR",
    network: "NETWORK_DEVICE",
    pc: "PC",
    external: "OTHER_DEVICE",
  };
  return map[v12Type] || "OTHER_DEVICE";
}
