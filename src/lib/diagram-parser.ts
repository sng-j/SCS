// ─── Diagram Parser ──────────────────────────────────────────────────────────
// Converts ship CBS network diagram (PDF/image) into structured device data
// Pipeline: Tesseract OCR → coordinate grouping → LLM cleanup
// Server-side only (uses child_process for Tesseract CLI)

import { execSync } from "child_process";
import { unlinkSync, existsSync } from "fs";
import path from "path";
import os from "os";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface OcrItem {
  text: string;
  conf: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ZoneBoundary {
  level: string;
  name: string;
  yStart: number;
  yEnd: number;
}

export interface DeviceCandidate {
  text: string;
  meta: string[];
  x: number;
  y: number;
  zone: string;
  category: string;
}

export interface DiagramDevice {
  name: string;
  id: string;
  zone: string;
  category: string;
  hwType: string;
  x: number;
  y: number;
}

export interface DiagramConnection {
  from: string;
  to: string;
  type: "ethernet" | "serial";
}

/**
 * Map free-form zone text from diagrams to standardized MARITIME_ZONES IDs.
 * Handles Lv-based labels, Korean/English zone names, and common variations.
 */
export function normalizeZoneId(zoneText: string): string {
  const t = zoneText.toLowerCase().trim();

  // Lv-based mapping (IEC 62443 levels)
  if (/lv\s*4|enterprise|it\s*network/i.test(t)) return "admin";
  if (/lv\s*3\.5|dmz|ot-?it/i.test(t)) return "communication";
  if (/lv\s*3|ot\s*network|infra/i.test(t)) return "navigation";
  if (/lv\s*2|supervisory|area\s*ctrl|control\s*room/i.test(t)) return "propulsion";
  if (/lv\s*1|field\s*device|basic\s*control/i.test(t)) return "safety";

  // Korean zone names
  if (/항해|브릿지|bridge/i.test(t)) return "navigation";
  if (/기관|엔진|engine|propulsion/i.test(t)) return "propulsion";
  if (/안전|safety/i.test(t)) return "safety";
  if (/화물|cargo/i.test(t)) return "cargo";
  if (/통신|communication|comm/i.test(t)) return "communication";
  if (/행정|admin|office|crew/i.test(t)) return "admin";
  if (/육상|shore|external/i.test(t)) return "shore";

  // Common vessel zone names
  if (/engine\s*room|ecr|machinery/i.test(t)) return "propulsion";
  if (/accom|accommodation/i.test(t)) return "admin";
  if (/main\s*deck|deck/i.test(t)) return "cargo";
  if (/aft\s*ship/i.test(t)) return "propulsion";
  if (/wheel\s*house|bridge/i.test(t)) return "navigation";

  // If already a valid zone ID, return as-is
  const validZones = ["navigation", "propulsion", "safety", "cargo", "communication", "admin", "shore"];
  if (validZones.includes(t)) return t;

  return zoneText; // Keep original if no match
}

export interface DiagramResult {
  devices: DiagramDevice[];
  connections: DiagramConnection[];
  zones: ZoneBoundary[];
  ocrItemCount: number;
  candidateCount: number;
}

// ─── Device keyword set ──────────────────────────────────────────────────────

const DEVICE_KEYWORDS = new Set([
  // Navigation & Bridge
  "SYSTEM", "SOLUTION", "NETWORK", "SERVER", "RADAR", "ECDIS",
  "CONNING", "HUB", "GATEWAY", "COMPASS", "VDR", "DGPS", "BNWAS", "VSAT",
  "VOIP", "CAS", "LOG", "PLANT", "CLOCK", "TELEPHONE", "ADAPTER", "EXTENDER",
  "SATELLITE", "CITADEL", "STEERING", "COMMUNICATION", "HERMACE", "SMART",
  "COMPUTER", "SPEED", "RADIO", "SOUND", "GYRO", "POE", "SENSOR", "S-RADAR",
  "X-RADAR", "MASTER", "VHF", "UHF", "POWERED", "INTELLIGENCE", "FIREWALL",
  "ROUTER", "SWITCH", "PLC", "HMI", "SCADA", "DCS", "RTU", "MONITOR",
  "CONTROLLER", "PRINTER", "CAMERA", "ALARM", "DETECTOR", "TRANSMITTER",
  "RECEIVER", "ANTENNA", "MODEM", "TRANSPONDER", "AIS", "GMDSS", "NAVTEX",
  "AUTOPILOT", "SONAR", "ECHO", "SOUNDER", "ANEMOMETER", "BAROMETER",
  // Engine & Machinery (Page 2-3)
  "SPU", "GPU", "DPU", "SCU", "CCU", "ECU", "ACU", "TCU", "MCU",
  "DAU", "PANEL", "BLOWER", "REMOTE", "MANAGED", "MODULE",
  "AMS", "BWTS", "LOADING", "CARGO", "BALLAST", "PUMP",
  "INCLINOMETER", "INTERFACE", "PLATE", "CABINET",
  // Sensors & Field devices (Page 3-4)
  "RECEIVER", "REGISTER", "BOX", "CMS", "NAVAIDS",
  "MONITORING", "TOUCH", "MAIN", "SOOT",
]);

const NOISE_WORDS = new Set([
  "Vv", "it", "+", ":", "=)", "ai]", "a]", "1", "<@", "<@-", "—", "-",
  "Lv4", "Lv3.5", "Lv3", "Lv2", "Lv1", "OT", "IT", "Basic", "Control",
  "Field", "device", "Area", "Supervisory", "Ctrl", "Enterprise",
  "OT-IT", "DMZ", "Network", "Infra.", "Ethernet", "Serial",
  "Lv", "Level",
]);

// ─── Step 1: Run Tesseract OCR ───────────────────────────────────────────────

export async function runOcr(imagePath: string): Promise<OcrItem[]> {
  // If PDF, convert to PNG first
  let pngPath = imagePath;
  let tempPng = false;

  if (imagePath.toLowerCase().endsWith(".pdf")) {
    const tmpDir = os.tmpdir();
    const baseName = `diagram_${Date.now()}`;
    pngPath = path.join(tmpDir, `${baseName}-1.png`);

    try {
      execSync(`pdftoppm -png -r 600 "${imagePath}" "${path.join(tmpDir, baseName)}"`, {
        timeout: 60000,
      });
      tempPng = true;
    } catch {
      throw new Error("Failed to convert PDF to image. Ensure pdftoppm is installed.");
    }

    if (!existsSync(pngPath)) {
      throw new Error("PDF conversion produced no output.");
    }
  }

  // Run Tesseract in TSV mode
  const tmpTsv = path.join(os.tmpdir(), `ocr_${Date.now()}`);
  try {
    execSync(`tesseract "${pngPath}" "${tmpTsv}" -l eng --psm 11 tsv`, {
      timeout: 60000,
    });
  } catch {
    throw new Error("Tesseract OCR failed. Ensure tesseract is installed.");
  }

  // Parse TSV output
  const tsvPath = `${tmpTsv}.tsv`;
  const { readFileSync } = await import("fs");
  const tsvContent = readFileSync(tsvPath, "utf-8");
  const lines = tsvContent.split("\n");
  const headers = lines[0]?.split("\t") || [];

  const items: OcrItem[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split("\t");
    if (cols.length < headers.length) continue;

    const text = (cols[headers.indexOf("text")] || "").trim();
    const conf = parseFloat(cols[headers.indexOf("conf")] || "-1");

    if (conf < 40 || !text || text.length < 2) continue;

    const left = parseFloat(cols[headers.indexOf("left")] || "0");
    const top = parseFloat(cols[headers.indexOf("top")] || "0");
    const width = parseFloat(cols[headers.indexOf("width")] || "0");
    const height = parseFloat(cols[headers.indexOf("height")] || "0");

    items.push({
      text,
      conf: Math.round(conf),
      x: Math.round(left + width / 2),
      y: Math.round(top + height / 2),
      w: Math.round(width),
      h: Math.round(height),
    });
  }

  // Cleanup temp files
  try { unlinkSync(tsvPath); } catch {}
  if (tempPng) { try { unlinkSync(pngPath); } catch {} }

  return items;
}

// ─── Step 2: Detect zone boundaries ──────────────────────────────────────────

export function detectZoneBoundaries(items: OcrItem[]): ZoneBoundary[] {
  // Find "Lv" markers in OCR data
  const lvMarkers: { level: string; y: number; name: string }[] = [];

  const sorted = [...items].sort((a, b) => a.y - b.y);

  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i];
    const text = item.text.trim();

    // Match "Lv4", "Lv3.5", "Lv3", "Lv2", "Lv1" (single word)
    let lvMatch = /^Lv\s*(\d+\.?\d*)$/.exec(text);

    // Also handle "Lv" as separate word — look for adjacent number
    if (!lvMatch && /^Lv$/i.test(text)) {
      for (let k = i + 1; k < sorted.length && k <= i + 3; k++) {
        const next = sorted[k];
        if (Math.abs(next.y - item.y) < 20 && Math.abs(next.x - item.x) < 80) {
          const numMatch = /^(\d+\.?\d*)$/.exec(next.text.trim());
          if (numMatch) {
            lvMatch = [text + numMatch[1], numMatch[1]] as unknown as RegExpExecArray;
            break;
          }
        }
      }
    }

    if (lvMatch) {
      // Look for zone name nearby (within 100px below, 300px right)
      let name = "";
      for (let j = i + 1; j < sorted.length && sorted[j].y - item.y < 80; j++) {
        const nearby = sorted[j];
        if (Math.abs(nearby.x - item.x) < 300 && nearby.y - item.y < 50) {
          const t = nearby.text.trim();
          if (!NOISE_WORDS.has(t) && t.length > 2) {
            name += (name ? " " : "") + t;
          }
        }
      }
      lvMarkers.push({ level: `Lv${lvMatch[1]}`, y: item.y, name });
    }
  }

  // Sort by y position (top to bottom)
  lvMarkers.sort((a, b) => a.y - b.y);

  // Create zone boundaries
  const zones: ZoneBoundary[] = [];
  for (let i = 0; i < lvMarkers.length; i++) {
    const yEnd = i < lvMarkers.length - 1 ? lvMarkers[i + 1].y - 1 : 99999;
    zones.push({
      level: lvMarkers[i].level,
      name: lvMarkers[i].name,
      yStart: lvMarkers[i].y,
      yEnd,
    });
  }

  // Fallback: single zone if no markers found
  if (zones.length === 0) {
    zones.push({ level: "Default", name: "Network", yStart: 0, yEnd: 99999 });
  }

  return zones;
}

// ─── Step 3: Group OCR items into device candidates ──────────────────────────
// Tested v3 algorithm: 95% pre-LLM accuracy (36/38 devices from test diagram)

export function groupOcrItems(items: OcrItem[], zones: ZoneBoundary[]): DeviceCandidate[] {
  // Remove noise words
  const clean = items
    .filter((it) => !NOISE_WORDS.has(it.text.trim()) && it.conf >= 30 && it.text.trim().length >= 2)
    .sort((a, b) => a.y - b.y || a.x - b.x);

  // Zone lookup
  function getZone(y: number): string {
    for (const z of zones) {
      if (y >= z.yStart && y <= z.yEnd) return z.level;
    }
    return zones[zones.length - 1]?.level || "Default";
  }

  // Category/ID patterns
  const CAT_PATTERN = /\((WH|EER|SGR|Bridge|STBD Console)\)/;

  // ── Pass 1: Group same-line items (y±15px, sequential x gap <100px) ──

  const lines: { text: string; x: number; y: number; conf: number }[] = [];
  const used = new Set<number>();

  for (let i = 0; i < clean.length; i++) {
    if (used.has(i)) continue;
    const line = [clean[i]];
    used.add(i);

    for (let j = i + 1; j < clean.length; j++) {
      if (used.has(j)) continue;
      if (Math.abs(clean[j].y - clean[i].y) <= 15) {
        if (Math.abs(clean[j].x - line[line.length - 1].x) <= 100) {
          line.push(clean[j]);
          used.add(j);
        }
      } else if (clean[j].y - clean[i].y > 15) {
        break;
      }
    }

    line.sort((a, b) => a.x - b.x);
    lines.push({
      text: line.map((g) => g.text).join(" "),
      x: line[0].x,
      y: line[0].y,
      conf: Math.max(...line.map((g) => g.conf)),
    });
  }

  // ── Pass 2: Identify device lines vs non-device lines ──

  const isDeviceLine = (text: string): boolean => {
    const words = new Set(text.toUpperCase().replace(/-/g, " ").split(/\s+/));
    return [...words].some((w) => DEVICE_KEYWORDS.has(w));
  };

  // ── Pass 3: Build candidates — device lines + meta from lines below ──

  const candidates: DeviceCandidate[] = [];

  for (const ln of lines) {
    // Skip if not a device line AND not a noise-adjacent device
    if (!isDeviceLine(ln.text)) continue;

    // Extract category from THIS line
    const catMatch = CAT_PATTERN.exec(ln.text);
    let category = catMatch ? catMatch[1] : "";

    // Check meta lines below (y+15~35, similar x)
    const meta: string[] = [];
    for (const other of lines) {
      if (other === ln) continue;
      if (Math.abs(other.x - ln.x) <= 80 && other.y - ln.y > 0 && other.y - ln.y <= 35) {
        // Only use meta for category extraction, NOT as device text
        if (!category) {
          const metaCat = CAT_PATTERN.exec(other.text);
          if (metaCat) category = metaCat[1];
        }
        meta.push(other.text);
      }
    }

    // Clean the text: remove category and ID from the device name
    let deviceText = ln.text;
    deviceText = deviceText.replace(CAT_PATTERN, "").trim();
    // Don't remove IDs here — let LLM handle it

    candidates.push({
      text: deviceText,
      meta,
      x: ln.x,
      y: ln.y,
      zone: getZone(ln.y),
      category,
    });
  }

  // ── Pass 4: Recover devices hidden behind noise items ──
  // e.g., "Vv" at [1594,1700] has "S-RADAR" at [1595,1732] below it
  // The noise "Vv" was filtered, but S-RADAR at y=1732 might not have been
  // picked up if it was attached to the noise item's position

  // Check ALL original items (including noise-filtered ones) for device keywords nearby
  const allItems = [...items].sort((a, b) => a.y - b.y);
  for (const item of allItems) {
    if (NOISE_WORDS.has(item.text.trim())) {
      // Look for device-keyword items within 40px below this noise item
      for (const other of allItems) {
        if (other === item) continue;
        if (Math.abs(other.x - item.x) <= 100 && other.y - item.y > 0 && other.y - item.y <= 40) {
          if (isDeviceLine(other.text)) {
            // Check not already captured
            const alreadyCaptured = candidates.some((c) => {
              const mainWord = other.text.toUpperCase().split(/\s+/)[0];
              return c.text.toUpperCase().includes(mainWord);
            });
            if (!alreadyCaptured) {
              const catMatch = CAT_PATTERN.exec(other.text);
              candidates.push({
                text: other.text.replace(CAT_PATTERN, "").trim(),
                meta: [],
                x: other.x,
                y: other.y,
                zone: getZone(other.y),
                category: catMatch ? catMatch[1] : "",
              });
            }
          }
        }
      }
    }
  }

  // ── Deduplicate by main text ──
  const seen = new Set<string>();
  return candidates.filter((c) => {
    const key = c.text.toUpperCase().trim();
    if (seen.has(key) || key.length < 2) return false;
    seen.add(key);
    return true;
  });
}

// ─── Step 4: LLM cleanup ────────────────────────────────────────────────────

export async function cleanWithLlm(
  candidates: DeviceCandidate[],
  llmApiUrl: string,
  llmModel: string,
): Promise<DiagramDevice[]> {
  // Build numbered candidate list
  let lines = "";
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const meta = c.meta.length > 0 ? ` meta=${JSON.stringify(c.meta)}` : "";
    lines += `  #${i + 1} [${c.x},${c.y}] zone=${c.zone} cat=${c.category}  "${c.text}"${meta}\n`;
  }

  const prompt = `You are cleaning up ${candidates.length} OCR-extracted device entries from a ship network diagram.

CRITICAL RULES:
- You MUST output EXACTLY one cleaned entry for each numbered input (#1 through #${candidates.length}).
- Do NOT skip, merge, or remove ANY entry. If two entries look similar, keep BOTH.
- The ONLY exception: entries that are clearly FRAGMENTS of another entry (like standalone "SYSTEM", "Hub", "TELEPHONE") should be merged INTO the entry they belong to, and the fragment entry removed.
- When merging fragments, the resulting entry keeps the lower number.

Input entries:
${lines}

Cleaning rules:
- Fix word order issues (e.g., "STEERING CONTROL" with nearby "SYSTEM" → "STEERING CONTROL SYSTEM")
- FRAGMENT MERGING: Standalone words like "SATELLITE", "Hub", "SYSTEM", "TELEPHONE" are fragments of multi-line device names. Merge them with the entry they belong to based on zone and position:
  * "SATELLITE" standalone + nearby "COMMUNICATION SYSTEM" → merge into "SATELLITE COMMUNICATION SYSTEM"
  * "SYSTEM with LRIT" at same zone → becomes "SATELLITE COMMUNICATION SYSTEM with LRIT"
  * "SYSTEMNo.2 STD-C" or similar → becomes "SATELLITE COMMUNICATION SYSTEM (No.2 STD-C)"
  * "Hub" standalone near Intelligence entries → merge into that Intelligence Hub entry
  * "SOUND POWERED" + nearby "TELEPHONE" → "SOUND POWERED TELEPHONE"
  * After merging, REMOVE the fragment entry (don't output it separately)
- Fix numbering: "Nol." → "No.1", "No2." → "No.2"
- Append missing suffixes: "Intelligence" alone → "Intelligence Hub"
- Fix number formatting: "41 VoIP" → "(41) VoIP"
- Fix: "UHF COMMUNICATION" → "UHF COMMUNICATION SYSTEM"
- Remove OCR noise: <@-, coordinates, symbols
- If ID like NO3301 appears in device name, move it to the "id" field

CATEGORY rules (IMPORTANT):
- "category" field MUST be one of: WH, EER, SGR, Bridge, STBD Console, or empty ""
- category comes from "cat=" in the input, NOT from meta text
- "CONNING", "SYSTEM", "TELEPHONE" are NOT categories — they are device name parts
- If cat= is empty, output category as ""

hwType assignment (use these exact values):
- ECDIS, RADAR, S-RADAR, X-RADAR, CONNING, HMI → PC
- Intelligence Hub, Mini Hub, Gateway, Firewall, Router, Switch → NETWORK_DEVICE
- LOG, DGPS, COMPASS, BNWAS, VDR, Sensor, GYRO, ECHO SOUNDER, AIS, GPS → SENSOR
- SERVER, COMPUTER NETWORK, SMART SHIP, SCADA → SERVER
- PLC, DCS, RTU, CONTROLLER → PLC
- Everything else → OTHER_DEVICE

Output a JSON array. Every non-fragment input MUST appear in output.
[{"name":"...","id":"...","zone":"...","category":"...","hwType":"..."}]`;

  // Call LLM via Ollama-compatible API
  const ollamaUrl = llmApiUrl.replace("/v1/chat/completions", "").replace(/\/$/, "");
  const apiUrl = `${ollamaUrl}/api/generate`;

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: llmModel,
      stream: false,
      prompt,
    }),
    signal: AbortSignal.timeout(300000), // 5 min timeout
  });

  if (!response.ok) {
    throw new Error(`LLM API error: ${response.status}`);
  }

  const data = await response.json();
  let resp: string = data.response || "";

  // Remove thinking tags if present
  if (resp.includes("</think>")) {
    resp = resp.substring(resp.indexOf("</think>") + 8).trim();
  }

  // Extract JSON array
  const jsonStart = resp.indexOf("[");
  const jsonEnd = resp.lastIndexOf("]") + 1;
  if (jsonStart < 0 || jsonEnd <= jsonStart) {
    throw new Error("LLM did not return valid JSON array");
  }

  const devices: DiagramDevice[] = JSON.parse(resp.substring(jsonStart, jsonEnd));

  // Attach original coordinates from candidates
  for (const device of devices) {
    // Find matching candidate by name similarity
    const match = candidates.find((c) => {
      const cWords = c.text.toUpperCase().split(/\s+/);
      const dWords = device.name.toUpperCase().split(/\s+/);
      return cWords.some((w) => dWords.includes(w) && w.length >= 3);
    });
    if (match) {
      device.x = match.x;
      device.y = match.y;
    }
  }

  return devices;
}

// ─── Step 5: Extract connections via LLM ─────────────────────────────────────

export async function extractConnections(
  devices: DiagramDevice[],
  ocrItems: OcrItem[],
  llmApiUrl: string,
  llmModel: string,
): Promise<DiagramConnection[]> {
  // Build device list with positions for context
  let deviceList = "";
  for (const d of devices) {
    deviceList += `  [${d.x},${d.y}] zone=${d.zone} type=${d.hwType}  "${d.name}"\n`;
  }

  // Find sub-zone labels (green boxes in the diagram) — text near hubs that indicates network segments
  const hubKeywords = ["HUB", "GATEWAY", "ADAPTER", "SWITCH"];
  const subLabels: string[] = [];
  for (const item of ocrItems) {
    const text = item.text.trim();
    // Look for labels like "ECDIS & CONNING", "VOIP", "CONNING" near hub devices
    if (text.includes("&") || (text.length < 20 && /^[A-Z\s\/&]+$/.test(text))) {
      const nearbyDevice = devices.find((d) =>
        Math.abs(d.x - item.x) < 200 && Math.abs(d.y - item.y) < 80 &&
        hubKeywords.some((k) => d.name.toUpperCase().includes(k))
      );
      if (nearbyDevice) {
        subLabels.push(`  "${text}" near "${nearbyDevice.name}" at [${item.x},${item.y}]`);
      }
    }
  }

  const subLabelBlock = subLabels.length > 0
    ? `\nSub-network labels found near hubs:\n${subLabels.join("\n")}\n`
    : "";

  const prompt = `You are analyzing a ship CBS network diagram. Given the device list with positions, determine which devices are connected.

Devices:
${deviceList}
${subLabelBlock}
Connection rules for ship network diagrams:
1. NETWORK_DEVICE (Hub/Gateway/Switch) connects to devices in its zone and adjacent zones
2. Devices at similar Y positions in same zone are usually on the same network segment
3. Hub devices connect vertically to other hubs (inter-zone backbone)
4. In Lv1, Sensor devices typically connect to the nearest Hub or Adapter via serial
5. In Lv4, Firewall/Router/Switch connects to SATELLITE systems and VSAT
6. HERMACE GATEWAY bridges Lv4 (IT) to Lv2 (OT)
7. Intelligence Hubs connect to RADAR, ECDIS, CONNING devices
8. Sensor Adapter connects to field sensors (DGPS, SPEED LOG, BNWAS, etc.)
9. Use "ethernet" for connections between hubs/servers/PCs, "serial" for sensor connections

Output ONLY a JSON array of connections:
[{"from":"device name","to":"device name","type":"ethernet"}]

Keep connections logical — only connect devices that would realistically be linked in a ship network. Output 20-40 connections.`;

  const ollamaUrl = llmApiUrl.replace("/v1/chat/completions", "").replace(/\/$/, "");

  const response = await fetch(`${ollamaUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: llmModel, stream: false, prompt }),
    signal: AbortSignal.timeout(300000),
  });

  if (!response.ok) {
    console.error("[extractConnections] LLM error:", response.status, "— using rule-based fallback");
    return fallbackConnections(devices);
  }

  const data = await response.json();
  let resp: string = data.response || "";
  if (resp.includes("</think>")) resp = resp.substring(resp.indexOf("</think>") + 8).trim();

  const jsonStart = resp.indexOf("[");
  const jsonEnd = resp.lastIndexOf("]") + 1;
  if (jsonStart < 0 || jsonEnd <= jsonStart) return [];

  try {
    const connections: DiagramConnection[] = JSON.parse(resp.substring(jsonStart, jsonEnd));
    // Validate: only keep connections where both devices exist
    const deviceNames = new Set(devices.map((d) => d.name.toUpperCase()));
    return connections.filter((c) =>
      deviceNames.has(c.from.toUpperCase()) && deviceNames.has(c.to.toUpperCase()) &&
      (c.type === "ethernet" || c.type === "serial")
    );
  } catch {
    console.error("[extractConnections] JSON parse error — using rule-based fallback");
    return fallbackConnections(devices);
  }
}

/**
 * Rule-based connection fallback when LLM fails.
 * Connects NETWORK_DEVICEs to same-zone devices, and cross-zone hubs.
 */
function fallbackConnections(devices: DiagramDevice[]): DiagramConnection[] {
  const conns: DiagramConnection[] = [];
  const hubs = devices.filter((d) => d.hwType === "NETWORK_DEVICE");
  const nonHubs = devices.filter((d) => d.hwType !== "NETWORK_DEVICE");

  for (const hub of hubs) {
    // Connect hub to same-zone non-hub devices
    const sameZone = nonHubs.filter((d) => d.zone === hub.zone);
    for (const device of sameZone) {
      conns.push({
        from: hub.name,
        to: device.name,
        type: device.hwType === "SENSOR" ? "serial" : "ethernet",
      });
    }
  }

  // Connect hubs to each other (backbone)
  for (let i = 0; i < hubs.length; i++) {
    for (let j = i + 1; j < hubs.length; j++) {
      if (hubs[i].zone !== hubs[j].zone) {
        conns.push({ from: hubs[i].name, to: hubs[j].name, type: "ethernet" });
      }
    }
  }

  return conns;
}

// ─── Step 6: Main pipeline ───────────────────────────────────────────────────

/** Step 1: OCR + Zone detection + Grouping (fast, ~2-5 sec) */
export async function parseStep1_OCR(filePath: string) {
  const ocrItems = await runOcr(filePath);
  const zones = detectZoneBoundaries(ocrItems);
  const candidates = groupOcrItems(ocrItems, zones);
  return { ocrItems, zones, candidates, ocrItemCount: ocrItems.length, candidateCount: candidates.length };
}

/** Step 2: LLM device cleanup (~20-60 sec) */
export async function parseStep2_Cleanup(
  candidates: DeviceCandidate[], llmApiUrl: string, llmModel: string
) {
  return await cleanWithLlm(candidates, llmApiUrl, llmModel);
}

/** Step 3: LLM connection extraction (~20-60 sec) */
export async function parseStep3_Connections(
  devices: DiagramDevice[], ocrItems: OcrItem[], llmApiUrl: string, llmModel: string
) {
  return await extractConnections(devices, ocrItems, llmApiUrl, llmModel);
}

/** Full pipeline (backward compatible) */
export async function parseDiagram(
  filePath: string,
  llmApiUrl: string,
  llmModel: string,
): Promise<DiagramResult> {
  const { ocrItems, zones, candidates, ocrItemCount, candidateCount } = await parseStep1_OCR(filePath);
  const devices = await parseStep2_Cleanup(candidates, llmApiUrl, llmModel);
  const connections = await parseStep3_Connections(devices, ocrItems, llmApiUrl, llmModel);
  return { devices, connections, zones, ocrItemCount, candidateCount };
}
