"use client";

import { useState, useRef, useEffect } from "react";
import { useLocaleStore } from "@/stores/locale-store";
import { tx, type Locale } from "@/lib/i18n";
import { Globe, Check } from "lucide-react";

// ─── Ship Network Topology ─────────────────────────────────────────────────
// Real maritime CBS network: Bridge → DMZ → Engine Room
// This is contextual branding — tells the user what SCS does without words.

const NODES = [
  // Bridge zone (y: 60–180)
  { id: "ecdis", label: "ECDIS", x: 130, y: 95, zone: "bridge" },
  { id: "radar", label: "Radar", x: 265, y: 75, zone: "bridge" },
  { id: "vdr", label: "VDR", x: 195, y: 155, zone: "bridge" },
  // Network core (y: 210–240)
  { id: "switch", label: "L3 Switch", x: 185, y: 228, zone: "network" },
  { id: "fw", label: "Firewall", x: 315, y: 215, zone: "network" },
  // Engine room (y: 290–400)
  { id: "ias", label: "IAS", x: 115, y: 320, zone: "engine" },
  { id: "plc", label: "PLC", x: 255, y: 305, zone: "engine" },
  { id: "sensor", label: "Sensor", x: 185, y: 380, zone: "engine" },
] as const;

const LINKS: [string, string][] = [
  ["ecdis", "switch"], ["radar", "switch"], ["vdr", "switch"],
  ["switch", "ias"], ["switch", "plc"], ["switch", "sensor"],
  ["switch", "fw"],
];

function getNode(id: string) {
  return NODES.find((n) => n.id === id)!;
}

// ─── Layout ─────────────────────────────────────────────────────────────────

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { locale, setLocale } = useLocaleStore();

  return (
    <div className="relative flex min-h-screen w-full overflow-hidden bg-surface-page">

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* LEFT PANEL — Ship Network Topology                                 */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <div className="hidden lg:flex lg:w-[480px] xl:w-[540px] flex-col relative overflow-hidden bg-surface-page">

        {/* Fine grid — technical/blueprint feel at extremely low opacity */}
        <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="fine-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#0F62FE" strokeWidth="0.3" opacity="0.06" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#fine-grid)" />
        </svg>

        {/* Content layer */}
        <div className="relative z-10 flex flex-col justify-between h-full p-10 xl:p-12">

          {/* ── Top: Logo ─────────────────────────────────────────────── */}
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-hover">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
              </svg>
            </div>
            <div>
              <p className="text-[15px] font-extrabold text-text tracking-tight">SCS</p>
              <p className="font-mono text-[10px] text-text-tertiary tracking-[0.08em]">Ship Equipment Cybersecurity Compliance Assessment System</p>
            </div>
          </div>

          {/* ── Middle: Topology Diagram ──────────────────────────────── */}
          <div className="flex-1 flex items-center justify-center -mt-4">
            <div className="relative w-[400px] h-[460px]">
              <svg viewBox="0 0 400 460" fill="none" className="w-full h-full">

                {/* Zone: Bridge */}
                <rect x="60" y="40" width="280" height="140" rx="8"
                  fill="#0F62FE" fillOpacity="0.03" stroke="#0F62FE" strokeWidth="0.8" strokeDasharray="4 3" opacity="0.25" />
                <text x="80" y="62" fill="#0F62FE" opacity="0.35" fontSize="10" fontFamily="IBM Plex Mono, monospace" fontWeight="500" letterSpacing="0.1em">
                  BRIDGE
                </text>

                {/* Zone: Engine Room */}
                <rect x="50" y="272" width="270" height="140" rx="8"
                  fill="#24A148" fillOpacity="0.02" stroke="#24A148" strokeWidth="0.8" strokeDasharray="4 3" opacity="0.25" />
                <text x="70" y="294" fill="#24A148" opacity="0.35" fontSize="10" fontFamily="IBM Plex Mono, monospace" fontWeight="500" letterSpacing="0.1em">
                  ENGINE ROOM
                </text>

                {/* DMZ separator */}
                <line x1="40" y1="218" x2="360" y2="218" stroke="#8D8D8D" strokeWidth="0.6" strokeDasharray="6 4" opacity="0.3" />
                <rect x="345" y="210" width="38" height="16" rx="3" fill="#F5F4F1" />
                <text x="364" y="222" textAnchor="middle" fill="#8D8D8D" opacity="0.5" fontSize="9" fontFamily="IBM Plex Mono, monospace" fontWeight="600">
                  DMZ
                </text>

                {/* Network links with pulse animation */}
                {LINKS.map(([fromId, toId], i) => {
                  const a = getNode(fromId);
                  const b = getNode(toId);
                  const isCrossZone = fromId === "fw" || toId === "fw";
                  return (
                    <g key={`link-${i}`}>
                      <line
                        x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                        stroke={isCrossZone ? "#DA1E28" : "#0F62FE"}
                        strokeWidth={isCrossZone ? "1" : "0.8"}
                        strokeDasharray={isCrossZone ? "4 3" : "none"}
                        opacity="0.18"
                      />
                      {/* Data flow particle */}
                      <circle r="1.8" fill="#0F62FE" opacity="0">
                        <animateMotion
                          dur={`${2.5 + i * 0.6}s`}
                          repeatCount="indefinite"
                          path={`M${a.x},${a.y} L${b.x},${b.y}`}
                        />
                        <animate
                          attributeName="opacity"
                          values="0;0.5;0"
                          dur={`${2.5 + i * 0.6}s`}
                          repeatCount="indefinite"
                        />
                      </circle>
                    </g>
                  );
                })}

                {/* Nodes */}
                {NODES.map((node) => {
                  const color = node.zone === "engine" ? "#24A148" : node.zone === "network" ? "#0F62FE" : "#0F62FE";
                  const isFirewall = node.id === "fw";
                  return (
                    <g key={node.id}>
                      {/* Soft glow */}
                      <circle cx={node.x} cy={node.y} r="20" fill={color} opacity="0.04">
                        <animate attributeName="opacity" values="0.02;0.06;0.02" dur="4s" repeatCount="indefinite" />
                      </circle>
                      {/* Outer ring */}
                      <circle cx={node.x} cy={node.y} r={isFirewall ? "8" : "6"} fill="none" stroke={color} strokeWidth="0.8" opacity="0.25" />
                      {/* Inner dot */}
                      <circle cx={node.x} cy={node.y} r={isFirewall ? "4" : "3"} fill={color} opacity="0.5" />
                      {/* Label */}
                      <text
                        x={node.x}
                        y={node.y - (isFirewall ? 14 : 12)}
                        textAnchor="middle"
                        fill={color}
                        opacity="0.45"
                        fontSize="9"
                        fontFamily="IBM Plex Mono, monospace"
                        fontWeight="500"
                      >
                        {node.label}
                      </text>
                      {/* Firewall shield icon */}
                      {isFirewall && (
                        <g transform={`translate(${node.x - 5}, ${node.y - 5})`} opacity="0.4">
                          <path d="M5 0C6.5 0 8 1 8 3.5C8 6.5 6.5 8 5 9C3.5 8 2 6.5 2 3.5C2 1 3.5 0 5 0Z"
                            fill="none" stroke="#DA1E28" strokeWidth="0.8" />
                        </g>
                      )}
                    </g>
                  );
                })}

                {/* Legend — bottom right */}
                <g transform="translate(270, 420)" opacity="0.35">
                  <circle cx="0" cy="0" r="3" fill="#0F62FE" />
                  <text x="10" y="3" fontSize="8" fill="#8D8D8D" fontFamily="IBM Plex Mono, monospace">OT Network</text>
                  <circle cx="0" cy="16" r="3" fill="#24A148" />
                  <text x="10" y="19" fontSize="8" fill="#8D8D8D" fontFamily="IBM Plex Mono, monospace">Control System</text>
                  <line x1="-4" y1="32" x2="4" y2="32" stroke="#DA1E28" strokeWidth="1" strokeDasharray="3 2" />
                  <text x="10" y="35" fontSize="8" fill="#8D8D8D" fontFamily="IBM Plex Mono, monospace">Firewall</text>
                </g>

              </svg>
            </div>
          </div>

          {/* ── Bottom: Company ───────────────────────────────────────── */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-px w-8 bg-border" />
              <span className="font-mono text-[10px] text-text-tertiary tracking-[0.08em]">CYTUR</span>
            </div>
            <span className="font-mono text-[10px] text-text-tertiary/50">
              Maritime Cybersecurity
            </span>
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* RIGHT PANEL — Form                                                 */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <div className="flex flex-1 flex-col bg-white">

        {/* Top bar: mobile logo + language toggle */}
        <div className="flex items-center justify-between px-6 py-4 sm:px-8">
          {/* Mobile logo — only visible on small screens */}
          <div className="flex items-center gap-2.5 lg:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-hover">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
              </svg>
            </div>
            <span className="text-[14px] font-extrabold text-text tracking-tight">SCS</span>
          </div>

          {/* Spacer for desktop (logo is in left panel) */}
          <div className="hidden lg:block" />

          {/* Language selector */}
          <LanguageSelector locale={locale} setLocale={setLocale} />
        </div>

        {/* Form area — vertically centered */}
        <div className="flex flex-1 items-center justify-center px-6 pb-12 sm:px-12 lg:px-16">
          <div className="w-full max-w-[400px]">
            {children}
          </div>
        </div>

        {/* Bottom line */}
        <div className="px-6 pb-5 sm:px-8">
          <div className="flex items-center justify-center gap-2">
            <div className="h-px flex-1 max-w-[40px] bg-border" />
            <span className="font-mono text-[9px] text-text-tertiary/40 tracking-[0.1em]">
              IACS UR E26 · E27 · IEC 62443
            </span>
            <div className="h-px flex-1 max-w-[40px] bg-border" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Language Dropdown ────────────────────────────────────────────────────

const LANG_OPTIONS: { value: Locale; label: string; flag: string }[] = [
  { value: "en", label: "English", flag: "🇺🇸" },
  { value: "ko", label: "한국어", flag: "🇰🇷" },
  { value: "ja", label: "日本語", flag: "🇯🇵" },
];

function LanguageSelector({ locale, setLocale }: { locale: string; setLocale: (l: Locale) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const current = LANG_OPTIONS.find((l) => l.value === locale) || LANG_OPTIONS[0];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-text-tertiary hover:text-text-secondary hover:bg-surface-secondary transition-all duration-150"
      >
        <Globe size={13} />
        {current.label}
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-40 bg-white border border-gray-200 rounded-lg shadow-xl z-50 py-1">
          {LANG_OPTIONS.map((lang) => (
            <button
              key={lang.value}
              onClick={() => { setLocale(lang.value); setOpen(false); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-left hover:bg-gray-50 transition-colors"
            >
              <span className="text-[15px]">{lang.flag}</span>
              <span className={locale === lang.value ? "font-semibold text-brand" : "text-text-secondary"}>
                {lang.label}
              </span>
              {locale === lang.value && <Check size={14} className="ml-auto text-brand" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
