import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Clean ALL tables (children before parents to respect FK constraints).
  // This covers every model in schema.prisma so that `npx tsx prisma/seed.ts`
  // always works without needing to delete the DB file first.

  // ── Leaf / junction tables ──
  await prisma.aiFeedback.deleteMany();
  await prisma.aiConversation.deleteMany();
  await prisma.aiNlpLog.deleteMany();
  await prisma.securityLog.deleteMany();
  await prisma.ipWhitelist.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.userActionLog.deleteMany();
  await prisma.loginLog.deleteMany();
  await prisma.loginAttempt.deleteMany();
  await prisma.cveMatch.deleteMany();
  await prisma.cveCache.deleteMany();
  await prisma.cveSyncState.deleteMany();

  // ── QnA ──
  await prisma.qnaFile.deleteMany();
  await prisma.qna.deleteMany();

  // ── Assessment / Risk / CVE ──
  await prisma.assessment.deleteMany();
  await prisma.riskEntry.deleteMany();
  await prisma.assetFile.deleteMany();

  // ── Network / DFD ──
  await prisma.networkConnection.deleteMany();
  await prisma.dfdLog.deleteMany();
  await prisma.dfdDiagram.deleteMany();

  // ── Software / Hardware (children of Equipment & Project) ──
  await prisma.software.deleteMany();
  await prisma.hardware.deleteMany();

  // ── Documents / Submissions ──
  await prisma.submissionFile.deleteMany();
  await prisma.document.deleteMany();
  await prisma.submission.deleteMany();
  await prisma.compliancePackage.deleteMany();

  // ── Audit ──
  await prisma.auditRun.deleteMany();
  await prisma.auditPassword.deleteMany();
  await prisma.vendorAuditResult.deleteMany();
  await prisma.certDocument.deleteMany();

  // ── Equipment / Templates ──
  await prisma.equipmentTemplate.deleteMany();
  await prisma.equipment.deleteMany();

  // ── Change tracking ──
  await prisma.changeEvent.deleteMany();

  // ── Content / System ──
  await prisma.faq.deleteMany();
  await prisma.societyChecklist.deleteMany();
  await prisma.docFormat.deleteMany();
  await prisma.setting.deleteMany();
  await prisma.vendorAdvisory.deleteMany();
  await prisma.exploitRef.deleteMany();
  await prisma.imgTemplate.deleteMany();
  await prisma.cveLocal.deleteMany();
  await prisma.signupRequest.deleteMany();

  // ── Top-level entities (parents last) ──
  await prisma.user.deleteMany();
  await prisma.project.deleteMany();
  await prisma.projectGroup.deleteMany();
  await prisma.shipyard.deleteMany();

  const pw = await bcrypt.hash("password123", 12);
  const adminPw = await bcrypt.hash("123123", 12);

  // ─── Shipyard (가상 조선소) ───
  const shipyard = await prisma.shipyard.create({
    data: {
      name: "테스트조선소",
      address: "테스트 주소",
      phone: "051-123-4567",
      contact: "테스트조선",
    },
  });

  // ─── Users (3 accounts — one per role) ───
  await prisma.user.create({
    data: { email: "admin@cytur.net", password: adminPw, name: "관리자", company: "CYTUR", role: "ADMIN", isActive: true },
  });

  // 기존 shipyard@cytur.kr을 SUPPORT 역할로 시드 (조선소 운영 담당)
  await prisma.user.create({
    data: { email: "shipyard@cytur.kr", password: pw, name: "테스트서포트", company: "테스트조선소", phone: "010-1234-5678", role: "SUPPORT", shipyardId: shipyard.id, isActive: true },
  });

  // SHIPYARD 역할은 읽기 전용 뷰어 — 조선소 내용을 열람만 가능
  await prisma.user.create({
    data: { email: "viewer@cytur.kr", password: pw, name: "테스트뷰어", company: "테스트조선소", phone: "010-0000-0000", role: "SHIPYARD", shipyardId: shipyard.id, isActive: true },
  });

  const vendor = await prisma.user.create({
    data: { email: "vendor@cytur.kr", password: pw, name: "테스트벤더", company: "테스트벤더사", phone: "010-9876-5432", role: "VENDOR", shipyardId: shipyard.id, isActive: true },
  });

  // ─── Project (가상 선박) ───
  const project = await prisma.project.create({
    data: {
      shipyardId: shipyard.id,
      vesselName: "TEST VESSEL",
      shipowner: "테스트해운",
      classification: "KR",
      systemName: "T-2025-001",
      status: "ACTIVE",
    },
  });

  // ─── Equipment (2 systems, both assigned to vendor) ───
  const eqEcdis = await prisma.equipment.create({
    data: {
      projectId: project.id,
      vendorId: vendor.id,
      name: "ECDIS System",
      description: "Electronic Chart Display and Information System — 전자해도표시시스템",
      status: "IN_PROGRESS",
    },
  });

  const eqIas = await prisma.equipment.create({
    data: {
      projectId: project.id,
      vendorId: vendor.id,
      name: "IAS (통합자동화시스템)",
      description: "Integrated Automation System — 기관실 자동화 및 모니터링",
      status: "IN_PROGRESS",
    },
  });

  // ─── Hardware — ECDIS (3 devices, mixed types) ───
  const hwEcdis1 = await prisma.hardware.create({
    data: {
      projectId: project.id, equipmentId: eqEcdis.id,
      name: "ECDIS Main Unit #1", type: "PC",
      manufacturer: "TestNav", model: "SN-3200",
      ipAddress: "192.168.1.10", zone: "navigation", location: "Navigation Bridge",
    },
  });

  const hwEcdis2 = await prisma.hardware.create({
    data: {
      projectId: project.id, equipmentId: eqEcdis.id,
      name: "ECDIS Main Unit #2", type: "PC",
      manufacturer: "TestNav", model: "SN-3200",
      ipAddress: "192.168.1.11", zone: "navigation", location: "Navigation Bridge",
    },
  });

  const hwSwitch1 = await prisma.hardware.create({
    data: {
      projectId: project.id, equipmentId: eqEcdis.id,
      name: "Bridge L3 Switch", type: "NETWORK_DEVICE",
      manufacturer: "TestNet", model: "NC-3300",
      ipAddress: "192.168.1.1", zone: "navigation", location: "Navigation Bridge",
    },
  });

  // ─── Hardware — IAS (3 devices, mixed types) ───
  const hwIasServer = await prisma.hardware.create({
    data: {
      projectId: project.id, equipmentId: eqIas.id,
      name: "IAS Server", type: "SERVER",
      manufacturer: "TestMarine", model: "MT-700",
      ipAddress: "192.168.2.10", zone: "propulsion", location: "Engine Control Room",
    },
  });

  const hwIasPlc = await prisma.hardware.create({
    data: {
      projectId: project.id, equipmentId: eqIas.id,
      name: "IAS PLC", type: "PLC",
      manufacturer: "TestMarine", model: "MT-PLC Module",
      ipAddress: "192.168.2.20", zone: "propulsion", location: "Engine Control Room",
    },
  });

  const hwSensor = await prisma.hardware.create({
    data: {
      projectId: project.id, equipmentId: eqIas.id,
      name: "Temperature Sensor Array", type: "SENSOR",
      manufacturer: "TestMarine", model: "TS-200",
      zone: "propulsion", location: "Engine Room",
    },
  });

  const allHw = [hwEcdis1, hwEcdis2, hwSwitch1, hwIasServer, hwIasPlc, hwSensor];

  // ─── Software ───
  await prisma.software.createMany({
    data: [
      // ECDIS
      { projectId: project.id, equipmentId: eqEcdis.id, hardwareId: hwEcdis1.id, name: "Windows 10 IoT Enterprise LTSC", version: "10.0.17763", vendor: "Microsoft", swType: "OS" },
      { projectId: project.id, equipmentId: eqEcdis.id, hardwareId: hwEcdis1.id, name: "SN-3200 ECDIS Software", version: "3.02.001", vendor: "TestNav", swType: "APPLICATION" },
      { projectId: project.id, equipmentId: eqEcdis.id, hardwareId: hwEcdis2.id, name: "Windows 10 IoT Enterprise LTSC", version: "10.0.17763", vendor: "Microsoft", swType: "OS" },
      { projectId: project.id, equipmentId: eqEcdis.id, hardwareId: hwEcdis2.id, name: "SN-3200 ECDIS Software", version: "3.02.001", vendor: "TestNav", swType: "APPLICATION" },
      { projectId: project.id, equipmentId: eqEcdis.id, hardwareId: hwSwitch1.id, name: "TestNet OS", version: "17.6.3", vendor: "TestNet", swType: "FIRMWARE" },
      // IAS
      { projectId: project.id, equipmentId: eqIas.id, hardwareId: hwIasServer.id, name: "Windows Server 2019", version: "10.0.17763", vendor: "Microsoft", swType: "OS" },
      { projectId: project.id, equipmentId: eqIas.id, hardwareId: hwIasServer.id, name: "MT-700 Runtime", version: "7.5.2", vendor: "TestMarine", swType: "APPLICATION" },
      { projectId: project.id, equipmentId: eqIas.id, hardwareId: hwIasPlc.id, name: "PLC Firmware", version: "2.1.0", vendor: "TestMarine", swType: "FIRMWARE" },
      { projectId: project.id, equipmentId: eqIas.id, hardwareId: hwSensor.id, name: "Sensor Firmware", version: "1.0.4", vendor: "TestMarine", swType: "FIRMWARE" },
    ],
  });

  // ─── Assessments — ALL SC checks for ALL hardware ───
  const scChecks = ["SC-1", "SC-2", "SC-5", "SC-6", "SC-7", "SC-10", "SC-11", "SC-13"];

  const resultMap: Record<string, typeof scChecks extends (infer _)[] ? string[] : never> = {
    PC:             ["PASS", "PASS", "PARTIAL", "PASS", "PASS", "FAIL", "NOT_APPLICABLE", "PASS"],
    SERVER:         ["PASS", "PASS", "PASS", "PASS", "PASS", "PARTIAL", "PASS", "PASS"],
    PLC:            ["NOT_APPLICABLE", "NOT_APPLICABLE", "PARTIAL", "NOT_APPLICABLE", "PASS", "PASS", "PASS", "PASS"],
    NETWORK_DEVICE: ["PASS", "PASS", "PASS", "PASS", "PASS", "PASS", "PASS", "PASS"],
    SENSOR:         ["NOT_APPLICABLE", "NOT_APPLICABLE", "NOT_APPLICABLE", "NOT_APPLICABLE", "NOT_APPLICABLE", "PASS", "PASS", "PASS"],
  };

  for (const hw of allHw) {
    const results = resultMap[hw.type] || resultMap.PC;
    for (let i = 0; i < scChecks.length; i++) {
      await prisma.assessment.create({
        data: {
          hardwareId: hw.id,
          checkId: scChecks[i],
          standard: "E27",
          result: results[i] as "PASS" | "FAIL" | "PARTIAL" | "NOT_APPLICABLE" | "NOT_CHECKED",
          evidence: results[i] === "PASS" ? "Configuration verified and compliant" : results[i] === "PARTIAL" ? "Partially compliant — remediation planned" : undefined,
          note: results[i] === "FAIL" ? "Non-compliant — requires remediation" : undefined,
        },
      });
    }
  }

  // ─── DFD Diagrams (both equipment) ───
  await prisma.dfdDiagram.create({
    data: {
      projectId: project.id,
      equipmentId: eqEcdis.id,
      source: "AI",
      data: JSON.stringify({
        nodes: [
          { id: hwEcdis1.id, type: "hardware", position: { x: 100, y: 100 }, data: { label: "ECDIS #1", hwType: "PC" } },
          { id: hwEcdis2.id, type: "hardware", position: { x: 300, y: 100 }, data: { label: "ECDIS #2", hwType: "PC" } },
          { id: hwSwitch1.id, type: "hardware", position: { x: 200, y: 250 }, data: { label: "Bridge Switch", hwType: "NETWORK_DEVICE" } },
        ],
        edges: [
          { id: "e1", source: hwEcdis1.id, target: hwSwitch1.id, data: { protocol: "TCP/IP", connectionType: "ethernet" } },
          { id: "e2", source: hwEcdis2.id, target: hwSwitch1.id, data: { protocol: "TCP/IP", connectionType: "ethernet" } },
        ],
      }),
    },
  });

  await prisma.dfdDiagram.create({
    data: {
      projectId: project.id,
      equipmentId: eqIas.id,
      source: "AI",
      data: JSON.stringify({
        nodes: [
          { id: hwIasServer.id, type: "hardware", position: { x: 200, y: 80 }, data: { label: "IAS Server", hwType: "SERVER" } },
          { id: hwIasPlc.id, type: "hardware", position: { x: 100, y: 230 }, data: { label: "IAS PLC", hwType: "PLC" } },
          { id: hwSensor.id, type: "hardware", position: { x: 300, y: 230 }, data: { label: "Temp Sensor", hwType: "SENSOR" } },
        ],
        edges: [
          { id: "e3", source: hwIasServer.id, target: hwIasPlc.id, data: { protocol: "Modbus TCP", connectionType: "ethernet" } },
          { id: "e4", source: hwIasPlc.id, target: hwSensor.id, data: { protocol: "Modbus RTU", connectionType: "serial" } },
        ],
      }),
    },
  });

  // ─── Risk Entries (사이버 위험 평가) ───
  await prisma.riskEntry.createMany({
    data: [
      { projectId: project.id, threatId: "T-001", assetRef: "ECDIS System", likelihood: 4, impact: 5, riskLevel: 20, mitigation: "네트워크 분리 및 접근통제 강화", status: "MITIGATED" },
      { projectId: project.id, threatId: "T-002", assetRef: "IAS PLC", likelihood: 3, impact: 5, riskLevel: 15, mitigation: "펌웨어 업데이트 및 물리적 접근 제한", status: "MITIGATED" },
      { projectId: project.id, threatId: "T-003", assetRef: "Bridge Switch", likelihood: 2, impact: 4, riskLevel: 8, mitigation: "포트 보안 설정 및 VLAN 분리", status: "MITIGATED" },
      { projectId: project.id, threatId: "T-004", assetRef: "IAS Server", likelihood: 3, impact: 4, riskLevel: 12, mitigation: "정기 보안 패치 적용", status: "OPEN" },
      { projectId: project.id, threatId: "T-005", assetRef: "Temperature Sensor", likelihood: 1, impact: 3, riskLevel: 3, status: "ACCEPTED" },
      { projectId: project.id, threatId: "T-006", assetRef: "ECDIS Main Unit", likelihood: 4, impact: 4, riskLevel: 16, mitigation: "안티바이러스 및 USB 제한 정책 적용", status: "MITIGATED" },
    ],
  });

  // ─── Hardening Audit Results (하드닝 검사 결과) ───
  await prisma.auditRun.create({
    data: {
      projectId: project.id,
      platform: "windows",
      results: JSON.stringify({
        hostname: "ECDIS-MAIN-01",
        os: "Windows 10 IoT Enterprise LTSC",
        scanDate: new Date().toISOString(),
        e27: {
          pass: 9, fail: 3, total: 12,
          items: [
            { cat: "SC-1", item: "Password Complexity", detail: "Enabled", pass: true },
            { cat: "SC-1", item: "Min Length >= 8", detail: "12", pass: true },
            { cat: "SC-1", item: "Max Age <= 90d", detail: "60", pass: true },
            { cat: "SC-1", item: "Lockout Threshold", detail: "5", pass: true },
            { cat: "SC-2", item: "Guest Disabled", detail: "True", pass: true },
            { cat: "SC-5", item: "SMBv1 Disabled", detail: "Yes", pass: true },
            { cat: "SC-5", item: "AutoRun Disabled", detail: "1", pass: true },
            { cat: "SC-6", item: "NLA Required", detail: "Yes", pass: true },
            { cat: "SC-6", item: "RDP Encryption >= 3", detail: "2", pass: false },
            { cat: "SC-7", item: "Logon Auditing", detail: "Enabled", pass: true },
            { cat: "SC-7", item: "Process Auditing", detail: "No", pass: false },
            { cat: "SC-10", item: "Antivirus Active", detail: "No", pass: false },
          ],
        },
      }),
      sbomData: JSON.stringify({
        software: [
          { name: "Windows 10 IoT Enterprise LTSC", version: "10.0.17763", publisher: "Microsoft" },
          { name: "SN-3200 ECDIS Software", version: "3.02.001", publisher: "TestNav" },
          { name: ".NET Framework", version: "4.8.0", publisher: "Microsoft" },
          { name: "Visual C++ Runtime", version: "14.29.0", publisher: "Microsoft" },
        ],
      }),
    },
  });

  // Vendor audit result file record (하드닝 파일 업로드 기록)
  await prisma.vendorAuditResult.create({
    data: {
      vendorId: vendor.id,
      equipmentId: eqEcdis.id,
      deviceName: "ECDIS Main Unit #1",
      filename: "ECDIS-MAIN-01_audit.scsaudit",
      filePath: "/uploads/audit/ecdis-main-01.scsaudit",
      mimeType: "application/octet-stream",
      size: 24576,
    },
  });

  // ─── Equipment Template (벤더 템플릿) ───
  await prisma.equipmentTemplate.create({
    data: {
      vendorId: vendor.id,
      name: "ECDIS 표준 구성",
      data: JSON.stringify({
        hardware: [
          { name: "ECDIS Main Unit", type: "PC", manufacturer: "TestNav", model: "SN-3200", zone: "navigation" },
          { name: "Bridge Switch", type: "NETWORK_DEVICE", manufacturer: "TestNet", model: "NC-3300", zone: "navigation" },
        ],
        software: [
          { name: "Windows 10 IoT Enterprise LTSC", version: "10.0.17763", vendor: "Microsoft", swType: "OS" },
          { name: "SN-3200 ECDIS Software", version: "3.02.001", vendor: "TestNav", swType: "APPLICATION" },
        ],
      }),
    },
  });

  // ─── Submission & Documents — ECDIS (제출 완료 · 승인됨) ───
  const subEcdis = await prisma.submission.create({
    data: {
      projectId: project.id,
      phase: "SUBMIT",
      status: "APPROVED",
      submittedAt: new Date(Date.now() - 3 * 86400_000), // 3일 전 제출
      reviewedBy: "테스트조선",
      reviewNote: "E27 요구사항 충족 확인. 승인합니다.",
    },
  });

  await prisma.document.createMany({
    data: [
      { submissionId: subEcdis.id, docType: "E27-CBS", title: "CBS 장비 목록 및 하드웨어 상세", format: "docx", status: "FINALIZED", generatedAt: new Date(Date.now() - 5 * 86400_000) },
      { submissionId: subEcdis.id, docType: "E27-SBOM", title: "소프트웨어 자재 명세서", format: "docx", status: "FINALIZED", generatedAt: new Date(Date.now() - 5 * 86400_000) },
      { submissionId: subEcdis.id, docType: "E27-AUD", title: "보안 능력 평가 보고서", format: "docx", status: "FINALIZED", generatedAt: new Date(Date.now() - 4 * 86400_000) },
      { submissionId: subEcdis.id, docType: "E27-TOP", title: "네트워크 및 시리얼 플로우 다이어그램", format: "docx", status: "FINALIZED", generatedAt: new Date(Date.now() - 4 * 86400_000) },
      { submissionId: subEcdis.id, docType: "E27-VUL", title: "취약점 평가서", format: "docx", status: "FINALIZED", generatedAt: new Date(Date.now() - 4 * 86400_000) },
      { submissionId: subEcdis.id, docType: "E27-ACC", title: "접근 통제 정책서", format: "docx", status: "FINALIZED", generatedAt: new Date(Date.now() - 4 * 86400_000) },
      { submissionId: subEcdis.id, docType: "E27-MON", title: "감사 로그 및 모니터링 계획서", format: "docx", status: "FINALIZED", generatedAt: new Date(Date.now() - 4 * 86400_000) },
    ],
  });

  // ─── Submission — IAS (문서 생성 진행 중) ───
  const subIas = await prisma.submission.create({
    data: { projectId: project.id, phase: "DOCUMENT", status: "DRAFT" },
  });

  await prisma.document.createMany({
    data: [
      { submissionId: subIas.id, docType: "E27-CBS", title: "CBS 장비 목록 및 하드웨어 상세", format: "docx", status: "GENERATED", generatedAt: new Date() },
      { submissionId: subIas.id, docType: "E27-SBOM", title: "소프트웨어 자재 명세서", format: "docx", status: "GENERATED", generatedAt: new Date() },
    ],
  });

  // ─── ECDIS equipment → APPROVED status ───
  await prisma.equipment.update({
    where: { id: eqEcdis.id },
    data: { status: "APPROVED" },
  });

  // ─── Compliance Package (준수 패키지) ───
  await prisma.compliancePackage.create({
    data: {
      projectId: project.id,
      standard: "E27",
      score: 87.5,
      checksPassed: 42,
      checksTotal: 48,
      signature: "SIG-2025-001-KR",
      signedBy: "테스트조선",
      signedByOrg: "테스트조선소",
      generatedAt: new Date(Date.now() - 2 * 86400_000),
    },
  });

  // ─── Society Checklist (선급 체크리스트 — KR) ───
  const krChecks = [
    { checkId: "KR-1.1", category: "접근통제", question: "선박 CBS에 대한 접근통제 정책이 수립되어 있는가?", questionKo: "선박 CBS에 대한 접근통제 정책이 수립되어 있는가?", guidance: "IACS UR E27 SC-1, SC-2 참조. 비밀번호 정책, 계정 관리 절차 확인" },
    { checkId: "KR-1.2", category: "접근통제", question: "비밀번호 복잡도 요구사항이 CBS에 적용되어 있는가?", questionKo: "비밀번호 복잡도 요구사항이 CBS에 적용되어 있는가?", guidance: "최소 8자, 복잡도 정책 활성화 여부 확인" },
    { checkId: "KR-1.3", category: "접근통제", question: "불필요한 기본 계정(Guest 등)이 비활성화되어 있는가?", questionKo: "불필요한 기본 계정(Guest 등)이 비활성화되어 있는가?", guidance: "Guest, Default Admin 등 기본 계정 비활성화 확인" },
    { checkId: "KR-2.1", category: "네트워크 보안", question: "CBS 네트워크가 선내 일반 네트워크와 분리되어 있는가?", questionKo: "CBS 네트워크가 선내 일반 네트워크와 분리되어 있는가?", guidance: "VLAN, 물리적 분리, 방화벽 등 네트워크 세그멘테이션 확인" },
    { checkId: "KR-2.2", category: "네트워크 보안", question: "불필요한 네트워크 서비스 및 포트가 차단되어 있는가?", questionKo: "불필요한 네트워크 서비스 및 포트가 차단되어 있는가?", guidance: "SMBv1, Telnet 등 레거시 프로토콜 비활성화 확인" },
    { checkId: "KR-2.3", category: "네트워크 보안", question: "원격 접속 시 암호화 통신이 적용되어 있는가?", questionKo: "원격 접속 시 암호화 통신이 적용되어 있는가?", guidance: "RDP NLA, SSH, VPN 등 암호화 접속 방법 확인" },
    { checkId: "KR-3.1", category: "감사 및 모니터링", question: "CBS에 대한 감사 로그가 활성화되어 있는가?", questionKo: "CBS에 대한 감사 로그가 활성화되어 있는가?", guidance: "로그온 이벤트, 프로세스 감사, 정책 변경 감사 확인" },
    { checkId: "KR-3.2", category: "감사 및 모니터링", question: "감사 로그가 정기적으로 검토되는 절차가 있는가?", questionKo: "감사 로그가 정기적으로 검토되는 절차가 있는가?", guidance: "로그 검토 주기, 책임자, 이상 징후 대응 절차 확인" },
    { checkId: "KR-4.1", category: "소프트웨어 관리", question: "CBS 소프트웨어의 무결성이 검증 가능한가?", questionKo: "CBS 소프트웨어의 무결성이 검증 가능한가?", guidance: "해시 검증, 코드 서명, Allowlisting 등 확인" },
    { checkId: "KR-4.2", category: "소프트웨어 관리", question: "안티바이러스 또는 동등한 보호 조치가 적용되어 있는가?", questionKo: "안티바이러스 또는 동등한 보호 조치가 적용되어 있는가?", guidance: "실시간 보호, 정의 업데이트 주기 확인" },
    { checkId: "KR-5.1", category: "물리적 보안", question: "CBS 장비에 대한 물리적 접근통제가 되어 있는가?", questionKo: "CBS 장비에 대한 물리적 접근통제가 되어 있는가?", guidance: "잠금장치, USB 포트 비활성화, 접근 로그 확인" },
    { checkId: "KR-5.2", category: "물리적 보안", question: "이동식 저장매체(USB) 사용이 통제되고 있는가?", questionKo: "이동식 저장매체(USB) 사용이 통제되고 있는가?", guidance: "USB 정책, AutoRun 비활성화 확인" },
  ];

  for (const c of krChecks) {
    await prisma.societyChecklist.create({
      data: { classification: "KR", checkId: c.checkId, category: c.category, question: c.question, questionKo: c.questionKo, guidance: c.guidance, isRequired: true },
    });
  }

  // ─── Q&A (벤더 질문 + 답변) ───
  const qna1 = await prisma.qna.create({
    data: {
      userId: vendor.id,
      projectId: project.id,
      targetType: "TO_SHIPYARD",
      title: "SC-10 소프트웨어 무결성 검증 방법",
      content: "ECDIS 장비의 SC-10 항목에서 소프트웨어 무결성 검증을 어떤 방법으로 진행해야 하나요? 화이트리스팅과 해시 검증 중 어떤 것이 요구되는지 알고 싶습니다.",
      status: "ANSWERED",
      answeredBy: "테스트조선",
      answer: "E27 SC-10에서는 화이트리스팅(Application Allowlisting) 또는 해시 기반 무결성 검증 중 하나를 적용하면 됩니다. ECDIS처럼 Windows 기반 장비는 Windows Defender Application Control(WDAC) 또는 AppLocker를 사용하시면 됩니다.",
    },
  });

  await prisma.qna.create({
    data: {
      userId: vendor.id,
      projectId: project.id,
      targetType: "TO_SHIPYARD",
      title: "IAS PLC 장비의 보안 평가 항목",
      content: "IAS PLC는 독립 운영체제가 없는 장비인데, SC-1(비밀번호)이나 SC-2(계정관리) 항목을 NOT_APPLICABLE로 처리해도 되는지 확인 부탁드립니다.",
      status: "OPEN",
    },
  });

  await prisma.qna.create({
    data: {
      userId: vendor.id,
      targetType: "TO_ADMIN",
      title: "하드닝 검사 도구 Linux 버전 지원",
      content: "ECDIS 장비 중 일부가 Linux 기반인데 하드닝 검사 도구의 Linux 버전은 어떻게 실행하나요? 실행 권한 관련 안내 부탁드립니다.",
      status: "ANSWERED",
      answeredBy: "관리자",
      answer: "Linux 버전은 다운로드 후 chmod +x scsaudit_linux 로 실행 권한을 부여하고, sudo ./scsaudit_linux 로 실행하시면 됩니다. 결과 파일(.scsaudit)을 업로드해주세요.",
    },
  });

  // ─── FAQ (가이드라인 페이지 + 어드민 관리) ───
  // 어드민 페이지 FaqTab은 questionKo/questionEn/answerKo/answerEn을 기대하지만
  // Prisma 모델은 question/answer 단일 필드. 가이드라인 페이지의 FaqTab이 실제 사용하는 필드로 저장.
  await prisma.faq.createMany({
    data: [
      { category: "general", question: "E27 인증 절차는 어떻게 진행되나요?", answer: "E27 인증은 4단계로 진행됩니다: 1)자산등록 → 2)보안평가 → 3)문서생성 → 4)선급 제출. 각 단계를 순서대로 완료하시면 됩니다.", sortOrder: 1 },
      { category: "general", question: "벤더사는 어떤 작업을 해야 하나요?", answer: "벤더사는 할당받은 기자재에 대해 하드웨어/소프트웨어를 등록하고, DFD를 작성하고, 보안 평가(SC-1~SC-13)를 진행한 후 문서를 생성하여 조선소에 제출합니다.", sortOrder: 2 },
      { category: "assessment", question: "SC 체크에서 NOT_APPLICABLE은 언제 사용하나요?", answer: "해당 보안 요구사항이 장비 특성상 적용 불가한 경우 사용합니다. 예: PLC 장비에 비밀번호 정책(SC-1)이 해당되지 않는 경우.", sortOrder: 3 },
      { category: "document", question: "문서는 자동으로 생성되나요?", answer: "네, 등록된 자산 정보와 평가 결과를 기반으로 E27/E26 문서가 자동 생성됩니다. 문서 페이지에서 생성 버튼을 클릭하면 됩니다.", sortOrder: 4 },
      { category: "assessment", question: "하드닝 검사는 어떻게 하나요?", answer: "기자재 상세 페이지 하단에서 감사 도구(Windows/Linux)를 다운로드하고, 선박 PC에서 실행 후 생성된 .scsaudit 파일을 업로드하면 자동 분석됩니다.", sortOrder: 5 },
      { category: "general", question: "조선소와 벤더의 역할 차이는 무엇인가요?", answer: "벤더는 자신이 공급하는 기자재의 사이버보안 인증을 준비하고, 조선소는 전체 프로젝트를 관리하며 벤더의 제출물을 검토/승인합니다.", sortOrder: 6 },
    ],
  });

  console.log("Seed complete!");
  console.log("");
  console.log("=== Accounts (password: password123) ===");
  console.log("  Admin:    admin@cytur.net (pw: 123123)");
  console.log("  Shipyard: shipyard@cytur.kr (테스트조선소)");
  console.log("  Vendor:   vendor@cytur.kr (테스트벤더사 → 테스트조선소)");
  console.log("");
  console.log("=== Data ===");
  console.log("  Project:    TEST VESSEL (T-2025-001, KR)");
  console.log("  Equipment:  ECDIS (승인) + IAS (진행 중)");
  console.log("  HW 6 / SW 9 / Assessment 48 / Risk 6 / DFD 2");
  console.log("  Hardening 1 / Template 1 / Compliance 87.5%");
  console.log("  Submission: ECDIS=APPROVED(7문서) / IAS=DRAFT(2문서)");
  console.log("  Society Checklist: KR 12항목");
  console.log("  Q&A: 3건 (2답변완료, 1미답변) / FAQ: 4건");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
