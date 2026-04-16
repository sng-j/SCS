// ── E27 Security Configuration Checks (SC-1 ~ SC-13) ──
// Based on IACS UR E27 Rev.1 (September 2023)
// Reference: IEC 62443-3-3 Foundational Requirements

export interface SCCheck {
  id: string;
  category: string;
  categoryKo: string;
  title: string;
  titleKo: string;
  description: string;
  descriptionKo: string;
  passItems: string[];
  passItemsKo: string[];
}

export const E27_SC_CHECKS: SCCheck[] = [
  {
    id: "SC-1",
    category: "Identification & Authentication",
    categoryKo: "식별 및 인증",
    title: "Human User Identification and Authentication",
    titleKo: "사용자 식별 및 인증",
    description: "CBS shall identify and authenticate all human users before allowing access. Configurable password policies including complexity, minimum length, expiration, history, and account lockout after failed attempts.",
    descriptionKo: "CBS는 접근을 허용하기 전에 모든 사용자를 식별하고 인증해야 합니다. 복잡도, 최소 길이, 만료, 이력, 실패 시 계정 잠금을 포함한 비밀번호 정책을 설정할 수 있어야 합니다.",
    passItems: [
      "Unique user identification for all human users",
      "Password complexity requirements enforceable (upper, lower, digits, special characters)",
      "Minimum password length configurable (8+ characters recommended)",
      "Password expiration and history configurable (prevent reuse of recent passwords)",
      "Account lockout after configurable number of failed login attempts",
      "No hardcoded or default passwords in production use",
    ],
    passItemsKo: [
      "모든 사용자에 대한 고유 사용자 식별",
      "비밀번호 복잡도 요구사항 적용 가능 (대문자, 소문자, 숫자, 특수문자)",
      "최소 비밀번호 길이 설정 가능 (8자 이상 권장)",
      "비밀번호 만료 및 이력 설정 가능 (최근 비밀번호 재사용 방지)",
      "설정 가능한 로그인 실패 횟수 후 계정 잠금",
      "운영 환경에서 하드코딩/기본 비밀번호 없음",
    ],
  },
  {
    id: "SC-2",
    category: "Use Control",
    categoryKo: "사용 제어",
    title: "Use Control and Authorization",
    titleKo: "사용 제어 및 권한 관리",
    description: "CBS shall enforce authorization based on user roles. Role separation between operator, administrator, and service technician. Ability to disable or remove unused accounts including guest accounts.",
    descriptionKo: "CBS는 사용자 역할에 따른 권한을 적용해야 합니다. 운영자, 관리자, 서비스 기술자 간 역할 분리가 필요하며, 게스트 계정 포함 미사용 계정을 비활성화/제거할 수 있어야 합니다.",
    passItems: [
      "Role-based access control implemented (operator, administrator, service technician)",
      "Principle of least privilege enforced for each role",
      "Guest and default accounts disabled or removed",
      "No shared generic accounts in operational use",
      "Ability to disable or remove unused accounts",
      "Privilege escalation requires additional authentication",
    ],
    passItemsKo: [
      "역할 기반 접근 제어 구현 (운영자, 관리자, 서비스 기술자)",
      "각 역할에 대해 최소 권한 원칙 적용",
      "게스트 및 기본 계정 비활성화 또는 제거",
      "운영 중 공유 일반 계정 없음",
      "미사용 계정 비활성화/제거 가능",
      "권한 상승 시 추가 인증 필요",
    ],
  },
  {
    id: "SC-3",
    category: "System Integrity",
    categoryKo: "시스템 무결성",
    title: "System Integrity Protection",
    titleKo: "시스템 무결성 보호",
    description: "CBS shall protect the integrity of the system software and configuration. Unauthorized modification of software, firmware, and configuration shall be prevented or detected.",
    descriptionKo: "CBS는 시스템 소프트웨어 및 구성의 무결성을 보호해야 합니다. 소프트웨어, 펌웨어, 구성의 무단 변경을 방지하거나 탐지해야 합니다.",
    passItems: [
      "File integrity monitoring for critical system files",
      "Software installation requires administrator privileges",
      "Configuration changes are logged and traceable",
      "Boot integrity verification mechanism exists",
      "Unauthorized software execution prevention (application whitelisting or equivalent)",
    ],
    passItemsKo: [
      "중요 시스템 파일에 대한 파일 무결성 모니터링",
      "소프트웨어 설치 시 관리자 권한 필요",
      "구성 변경 사항 기록 및 추적 가능",
      "부팅 무결성 검증 메커니즘 존재",
      "무단 소프트웨어 실행 방지 (애플리케이션 화이트리스트 또는 동등 수단)",
    ],
  },
  {
    id: "SC-4",
    category: "Data Confidentiality",
    categoryKo: "데이터 기밀성",
    title: "Data Confidentiality Protection",
    titleKo: "데이터 기밀성 보호",
    description: "CBS shall protect the confidentiality of data at rest and in transit. Sensitive configuration data, credentials, and logs shall be protected from unauthorized disclosure.",
    descriptionKo: "CBS는 저장 및 전송 중인 데이터의 기밀성을 보호해야 합니다. 민감한 구성 데이터, 자격 증명, 로그를 무단 노출로부터 보호해야 합니다.",
    passItems: [
      "Credentials stored in encrypted or hashed form (not plaintext)",
      "Sensitive configuration data protected from unauthorized access",
      "Communication of credentials uses encrypted channels",
      "Removable media data protection policy defined",
      "Screen lock prevents unauthorized viewing of sensitive data",
    ],
    passItemsKo: [
      "자격 증명이 암호화 또는 해시 형태로 저장 (평문 아님)",
      "민감한 구성 데이터가 무단 접근으로부터 보호됨",
      "자격 증명 전송 시 암호화된 채널 사용",
      "이동식 미디어 데이터 보호 정책 정의",
      "화면 잠금으로 민감 데이터의 무단 열람 방지",
    ],
  },
  {
    id: "SC-5",
    category: "Restricted Data Flow",
    categoryKo: "데이터 흐름 제한",
    title: "Network Segmentation and Restrictive Data Flow",
    titleKo: "네트워크 분리 및 데이터 흐름 제한",
    description: "CBS network shall be segmented appropriately. Insecure protocols disabled, unnecessary services removed, USB/removable media controlled, and only required network ports opened.",
    descriptionKo: "CBS 네트워크는 적절히 분리되어야 합니다. 안전하지 않은 프로토콜 비활성화, 불필요한 서비스 제거, USB/이동식 미디어 통제, 필요한 네트워크 포트만 개방해야 합니다.",
    passItems: [
      "OT network segmented from IT/corporate network",
      "SMBv1 and other insecure protocols disabled",
      "AutoRun/AutoPlay disabled for removable media",
      "Unnecessary network services disabled (Telnet, FTP, etc.)",
      "Only required network protocols and ports enabled",
      "USB port access controlled or disabled where not needed",
      "Firewall rules documented and reviewed",
    ],
    passItemsKo: [
      "OT 네트워크와 IT/기업 네트워크 분리",
      "SMBv1 및 기타 안전하지 않은 프로토콜 비활성화",
      "이동식 미디어에 대한 AutoRun/AutoPlay 비활성화",
      "불필요한 네트워크 서비스 비활성화 (Telnet, FTP 등)",
      "필요한 네트워크 프로토콜 및 포트만 활성화",
      "불필요한 USB 포트 접근 제어 또는 비활성화",
      "방화벽 규칙 문서화 및 검토",
    ],
  },
  {
    id: "SC-6",
    category: "Timely Response to Events",
    categoryKo: "이벤트에 대한 적시 대응",
    title: "Remote Access Security",
    titleKo: "원격 접속 보안",
    description: "Remote access to CBS shall be securely configured or disabled. If RDP or other remote access is enabled, strong authentication (NLA), encryption (TLS), and access restrictions must be enforced.",
    descriptionKo: "CBS에 대한 원격 접속은 안전하게 구성되거나 비활성화되어야 합니다. RDP 또는 기타 원격 접속이 활성화된 경우, 강력한 인증(NLA), 암호화(TLS), 접근 제한이 적용되어야 합니다.",
    passItems: [
      "RDP disabled if not operationally required",
      "Network Level Authentication (NLA) required if RDP enabled",
      "TLS encryption enforced for remote sessions",
      "Remote access restricted to specific IP ranges or VLANs",
      "Remote session timeout configured",
      "Remote access events logged and monitored",
      "Multi-factor authentication for remote access (where feasible)",
    ],
    passItemsKo: [
      "운영상 불필요 시 RDP 비활성화",
      "RDP 활성화 시 네트워크 수준 인증(NLA) 필수",
      "원격 세션에 대한 TLS 암호화 적용",
      "원격 접근이 특정 IP 범위 또는 VLAN으로 제한",
      "원격 세션 타임아웃 구성",
      "원격 접속 이벤트 기록 및 모니터링",
      "원격 접속에 대한 다중 인증 (가능한 경우)",
    ],
  },
  {
    id: "SC-7",
    category: "Resource Availability",
    categoryKo: "자원 가용성",
    title: "Security Audit Logging",
    titleKo: "보안 감사 로깅",
    description: "CBS shall generate security-relevant audit logs. Logs shall include authentication events, configuration changes, and security-relevant actions with synchronized timestamps.",
    descriptionKo: "CBS는 보안 관련 감사 로그를 생성해야 합니다. 로그는 인증 이벤트, 구성 변경, 보안 관련 작업을 동기화된 타임스탬프와 함께 포함해야 합니다.",
    passItems: [
      "Login/logout events logged with timestamps",
      "Failed authentication attempts logged",
      "Configuration changes logged with user identity",
      "Security-relevant actions logged",
      "Timestamps synchronized via NTP or equivalent",
      "Minimum log retention period met (90 days recommended)",
      "Logs protected from unauthorized modification or deletion",
    ],
    passItemsKo: [
      "로그인/로그아웃 이벤트 타임스탬프와 함께 기록",
      "인증 실패 시도 기록",
      "구성 변경 사항 사용자 정보와 함께 기록",
      "보안 관련 작업 기록",
      "NTP 또는 동등 수단으로 타임스탬프 동기화",
      "최소 로그 보존 기간 충족 (90일 권장)",
      "로그 무단 수정 또는 삭제 방지",
    ],
  },
  {
    id: "SC-8",
    category: "Communication Integrity",
    categoryKo: "통신 무결성",
    title: "Communication Integrity and Authentication",
    titleKo: "통신 무결성 및 인증",
    description: "CBS shall ensure integrity and authenticity of communications. Network communications shall be protected against manipulation, and communication endpoints shall be authenticated where applicable.",
    descriptionKo: "CBS는 통신의 무결성과 진정성을 보장해야 합니다. 네트워크 통신은 변조로부터 보호되어야 하며, 적용 가능한 경우 통신 엔드포인트가 인증되어야 합니다.",
    passItems: [
      "Encrypted protocols used for sensitive communications (TLS, SSH, IPSec)",
      "Communication endpoint authentication for critical links",
      "Network traffic monitoring capability exists",
      "VLAN or physical network separation for critical systems",
      "Wireless communications secured with WPA2/WPA3 or disabled",
    ],
    passItemsKo: [
      "민감한 통신에 암호화 프로토콜 사용 (TLS, SSH, IPSec)",
      "중요 링크에 대한 통신 엔드포인트 인증",
      "네트워크 트래픽 모니터링 기능 존재",
      "중요 시스템에 대한 VLAN 또는 물리적 네트워크 분리",
      "무선 통신 WPA2/WPA3으로 보안 설정 또는 비활성화",
    ],
  },
  {
    id: "SC-9",
    category: "Backup & Recovery",
    categoryKo: "백업 및 복구",
    title: "Backup, Recovery, and Resilience",
    titleKo: "백업, 복구 및 복원력",
    description: "CBS shall support backup and recovery of critical data and configuration. Recovery Time Objectives (RTO) shall be defined and tested for critical systems to ensure operational resilience.",
    descriptionKo: "CBS는 중요 데이터 및 구성의 백업과 복구를 지원해야 합니다. 운영 복원력을 보장하기 위해 중요 시스템의 복구 시간 목표(RTO)가 정의되고 테스트되어야 합니다.",
    passItems: [
      "Critical system data and configuration regularly backed up",
      "Backup integrity verification mechanism exists",
      "Restore procedure documented and tested",
      "Recovery Time Objective (RTO) defined for critical systems",
      "Backup media stored securely and separately from primary system",
      "Rollback capability exists for system updates",
    ],
    passItemsKo: [
      "중요 시스템 데이터 및 구성 정기 백업",
      "백업 무결성 검증 메커니즘 존재",
      "복원 절차 문서화 및 테스트 완료",
      "중요 시스템의 복구 시간 목표(RTO) 정의",
      "백업 미디어가 기본 시스템과 별도로 안전하게 보관",
      "시스템 업데이트에 대한 롤백 기능 존재",
    ],
  },
  {
    id: "SC-10",
    category: "Session Management",
    categoryKo: "세션 관리",
    title: "Automatic Session Lock and Management",
    titleKo: "자동 세션 잠금 및 관리",
    description: "CBS shall enforce automatic session lock after configurable inactivity period. Bridge/navigation systems may have extended timeouts. Re-authentication required to resume locked sessions.",
    descriptionKo: "CBS는 설정 가능한 비활성 기간 후 자동 세션 잠금을 적용해야 합니다. 브릿지/항해 시스템은 연장된 타임아웃이 허용됩니다. 잠긴 세션 재개 시 재인증이 필요합니다.",
    passItems: [
      "Screen lock after configurable inactivity period (max 15 min for non-bridge systems)",
      "Extended timeout allowable for bridge/navigation systems with justification",
      "Re-authentication required to unlock session",
      "Manual screen lock capability available (e.g., keyboard shortcut)",
      "Screen saver with password protection enabled",
    ],
    passItemsKo: [
      "설정 가능한 비활성 기간 후 화면 잠금 (비 브릿지 시스템 최대 15분)",
      "브릿지/항해 시스템은 정당한 사유로 연장된 타임아웃 허용",
      "세션 잠금 해제 시 재인증 필요",
      "수동 화면 잠금 기능 사용 가능 (예: 키보드 단축키)",
      "비밀번호 보호가 포함된 화면 보호기 활성화",
    ],
  },
  {
    id: "SC-11",
    category: "Malware Protection",
    categoryKo: "악성코드 방어",
    title: "Malware Protection and Detection",
    titleKo: "악성코드 방어 및 탐지",
    description: "CBS shall have anti-malware protection installed, or application whitelisting as an alternative for OT systems. Signature updates shall be applicable, and real-time or scheduled scanning shall be configured.",
    descriptionKo: "CBS에는 안티멀웨어가 설치되거나, OT 시스템의 경우 애플리케이션 화이트리스트가 대안으로 적용되어야 합니다. 시그니처 업데이트가 가능하고, 실시간 또는 예약 검사가 구성되어야 합니다.",
    passItems: [
      "Antivirus/anti-malware installed (or application whitelisting as alternative for OT)",
      "Malware signature/definition updates can be applied",
      "Real-time scanning enabled or compensating controls documented",
      "Removable media scanning configured before use",
      "Quarantine and alerting capability exists",
      "Malware detection events logged",
    ],
    passItemsKo: [
      "안티바이러스/안티멀웨어 설치 (또는 OT용 애플리케이션 화이트리스트 대안)",
      "악성코드 시그니처/정의 업데이트 적용 가능",
      "실시간 검사 활성화 또는 보상 통제 문서화",
      "사용 전 이동식 미디어 검사 구성",
      "격리 및 경고 기능 존재",
      "악성코드 탐지 이벤트 기록",
    ],
  },
  {
    id: "SC-12",
    category: "Physical Security",
    categoryKo: "물리적 보안",
    title: "Physical Security of CBS",
    titleKo: "CBS의 물리적 보안",
    description: "CBS shall have physical security measures to prevent unauthorized physical access. Physical ports (USB, serial, network) shall be controlled, and tamper detection should be considered for critical systems.",
    descriptionKo: "CBS는 무단 물리적 접근을 방지하기 위한 물리적 보안 조치가 있어야 합니다. 물리적 포트(USB, 시리얼, 네트워크)가 통제되어야 하며, 중요 시스템에 대한 변조 탐지가 고려되어야 합니다.",
    passItems: [
      "Physical access to CBS equipment restricted (locked cabinets/rooms)",
      "Unused physical ports (USB, serial) disabled or physically blocked",
      "Network ports in accessible areas secured or disabled",
      "Physical security measures documented",
      "Tamper-evident seals or detection for critical components (where applicable)",
    ],
    passItemsKo: [
      "CBS 장비에 대한 물리적 접근 제한 (잠금 캐비닛/방)",
      "미사용 물리적 포트(USB, 시리얼) 비활성화 또는 물리적으로 차단",
      "접근 가능한 영역의 네트워크 포트 보안 또는 비활성화",
      "물리적 보안 조치 문서화",
      "중요 구성요소에 대한 변조 방지 봉인 또는 탐지 (해당 시)",
    ],
  },
  {
    id: "SC-13",
    category: "Patch Management",
    categoryKo: "패치 관리",
    title: "Security Patch and Update Management",
    titleKo: "보안 패치 및 업데이트 관리",
    description: "CBS shall support a documented process for applying, testing, and rolling back security patches. Regular patch review and controlled deployment shall be maintained.",
    descriptionKo: "CBS는 보안 패치의 적용, 테스트 및 롤백을 위한 문서화된 프로세스를 지원해야 합니다. 정기적인 패치 검토와 통제된 배포가 유지되어야 합니다.",
    passItems: [
      "Documented patch management procedure exists",
      "Patches can be applied in a controlled manner",
      "Patch testing process defined before production deployment",
      "Rollback capability exists for failed patches",
      "Regular patch review cycle evidenced (quarterly minimum)",
      "Automatic update mechanism available (or compensating manual process)",
    ],
    passItemsKo: [
      "문서화된 패치 관리 절차 존재",
      "통제된 방식으로 패치 적용 가능",
      "운영 배포 전 패치 테스트 프로세스 정의",
      "실패한 패치에 대한 롤백 기능 존재",
      "정기적인 패치 검토 주기 증명 (최소 분기별)",
      "자동 업데이트 메커니즘 가용 (또는 보상적 수동 프로세스)",
    ],
  },
];

// ── Classification Society Specific Checklists ──
// Based on partner project (fleet_compliance.php) + classification society guidelines

export interface SocietyCheckItem {
  key: string;
  cat: string;
  catKo: string;
  item: string;
  itemKo: string;
}

export const SOCIETY_CHECKLIST_COMMON: SocietyCheckItem[] = [
  { key: "access_control",    cat: "Access Control",    catKo: "접근 제어",    item: "All systems require authentication before access",              itemKo: "모든 시스템이 접근 전 인증을 요구함" },
  { key: "patch_management",  cat: "Patch Management",  catKo: "패치 관리",    item: "Security patches applied within defined timeframes",            itemKo: "정의된 기간 내 보안 패치 적용" },
  { key: "network_segment",   cat: "Network Security",  catKo: "네트워크 보안", item: "OT network is segmented from IT/corporate network",             itemKo: "OT 네트워크가 IT/기업 네트워크와 분리됨" },
  { key: "incident_response", cat: "Incident Response",  catKo: "사고 대응",    item: "Documented cyber incident response procedure exists",           itemKo: "문서화된 사이버 사고 대응 절차 존재" },
  { key: "backup_restore",    cat: "Resilience",         catKo: "복원력",       item: "Critical system data backed up and restore tested",             itemKo: "중요 시스템 데이터 백업 및 복원 테스트 완료" },
  { key: "asset_inventory",   cat: "Asset Management",   catKo: "자산 관리",    item: "Complete CBS hardware and software inventory maintained",       itemKo: "CBS 하드웨어 및 소프트웨어 전체 목록 관리" },
  { key: "malware_protect",   cat: "Malware Protection", catKo: "악성코드 방어", item: "Anti-malware or application whitelisting on applicable systems", itemKo: "해당 시스템에 안티멀웨어 또는 애플리케이션 화이트리스트 적용" },
  { key: "physical_security", cat: "Physical Security",  catKo: "물리적 보안",   item: "Physical access controls for CBS equipment in place",           itemKo: "CBS 장비에 대한 물리적 접근 통제 적용" },
  { key: "audit_logging",     cat: "Audit & Monitoring",  catKo: "감사 및 모니터링", item: "Security events logged and retained for minimum 90 days",    itemKo: "보안 이벤트 기록 및 최소 90일 보존" },
  { key: "remote_access",     cat: "Remote Access",      catKo: "원격 접속",    item: "Remote access secured with strong auth and encryption",         itemKo: "원격 접속이 강력한 인증 및 암호화로 보안됨" },
];

export const SOCIETY_CHECKLIST_EXTRA: Record<string, SocietyCheckItem[]> = {
  KR: [
    { key: "kr_risk_assessment",   cat: "KR Requirements", catKo: "KR 요건", item: "Cyber risk assessment documented per KR Cyber Resilience guide",    itemKo: "KR 사이버 복원력 가이드에 따른 사이버 위험 평가 문서화" },
    { key: "kr_sw_mgmt",           cat: "KR Requirements", catKo: "KR 요건", item: "Software inventory maintained with change control records",         itemKo: "변경 관리 기록이 포함된 소프트웨어 목록 관리" },
    { key: "kr_access_log",        cat: "KR Requirements", catKo: "KR 요건", item: "System access logs retained for minimum 90 days",                   itemKo: "시스템 접근 로그 최소 90일 보존" },
    { key: "kr_crypto",            cat: "KR Requirements", catKo: "KR 요건", item: "Encrypted communications used for all remote access",               itemKo: "모든 원격 접속에 암호화 통신 사용" },
    { key: "kr_type_approval",     cat: "KR Requirements", catKo: "KR 요건", item: "CBS type approval certificate obtained from KR",                    itemKo: "KR로부터 CBS 형식 승인 인증서 취득" },
    { key: "kr_vulnerability",     cat: "KR Requirements", catKo: "KR 요건", item: "Known vulnerability assessment (CVE check) performed on CBS",       itemKo: "CBS에 대한 알려진 취약점 평가(CVE 확인) 수행" },
  ],
  LR: [
    { key: "lr_cyber_mgmt_plan",   cat: "LR Requirements", catKo: "LR 요건", item: "Cyber Security Management Plan (CSMP) approved by LR",             itemKo: "LR 승인 사이버 보안 관리 계획(CSMP)" },
    { key: "lr_vsat",              cat: "LR Requirements", catKo: "LR 요건", item: "VSAT/comms equipment isolated from ECDIS/navigation systems",       itemKo: "VSAT/통신 장비가 ECDIS/항해 시스템과 분리됨" },
    { key: "lr_drills",            cat: "LR Requirements", catKo: "LR 요건", item: "Annual cyber security drills conducted and documented",             itemKo: "연간 사이버 보안 훈련 실시 및 문서화" },
    { key: "lr_sbom",              cat: "LR Requirements", catKo: "LR 요건", item: "SBOM available for all critical onboard software",                  itemKo: "모든 중요 선내 소프트웨어에 대한 SBOM 제공" },
    { key: "lr_shipright",         cat: "LR Requirements", catKo: "LR 요건", item: "ShipRight Cyber descriptive note documentation complete",           itemKo: "ShipRight Cyber 서술 노트 문서 작성 완료" },
  ],
  DNV: [
    { key: "dnv_class_notation",   cat: "DNV Requirements", catKo: "DNV 요건", item: "DNV Cyber Secure class notation scope defined (Basic/Advanced/+)", itemKo: "DNV Cyber Secure 선급 부기 범위 정의 (Basic/Advanced/+)" },
    { key: "dnv_ot_baseline",      cat: "DNV Requirements", catKo: "DNV 요건", item: "OT system baseline configuration documented per DNV-CP-0231",     itemKo: "DNV-CP-0231에 따른 OT 시스템 기준 구성 문서화" },
    { key: "dnv_vuln_scan",        cat: "DNV Requirements", catKo: "DNV 요건", item: "Vulnerability scan performed on OT/IT systems and documented",    itemKo: "OT/IT 시스템에 대한 취약점 스캔 수행 및 문서화" },
    { key: "dnv_recovery_time",    cat: "DNV Requirements", catKo: "DNV 요건", item: "Recovery Time Objective (RTO) defined for critical systems",       itemKo: "중요 시스템의 복구 시간 목표(RTO) 정의" },
    { key: "dnv_network_diagram",  cat: "DNV Requirements", catKo: "DNV 요건", item: "Network topology diagram verified and up to date",                itemKo: "네트워크 토폴로지 다이어그램 검증 및 최신화" },
    { key: "dnv_penetration_test", cat: "DNV Requirements", catKo: "DNV 요건", item: "Penetration testing conducted for Cyber Secure Advanced+ notation", itemKo: "Cyber Secure Advanced+ 부기를 위한 침투 테스트 수행" },
  ],
  ABS: [
    { key: "abs_cyber_resilience", cat: "ABS Requirements", catKo: "ABS 요건", item: "ABS Cyber Resilience notation requirements met",                  itemKo: "ABS Cyber Resilience 부기 요건 충족" },
    { key: "abs_malware",          cat: "ABS Requirements", catKo: "ABS 요건", item: "Anti-malware protection on all applicable IT/OT systems",         itemKo: "모든 해당 IT/OT 시스템에 안티멀웨어 적용" },
    { key: "abs_remote_access",    cat: "ABS Requirements", catKo: "ABS 요건", item: "Remote access controlled via jump server, VPN, or equivalent",    itemKo: "점프 서버, VPN 또는 동등 수단으로 원격 접속 제어" },
    { key: "abs_change_mgmt",      cat: "ABS Requirements", catKo: "ABS 요건", item: "Change management process documented and followed for CBS",       itemKo: "CBS에 대한 변경 관리 프로세스 문서화 및 준수" },
    { key: "abs_crew_training",    cat: "ABS Requirements", catKo: "ABS 요건", item: "Crew cyber awareness training program in place",                  itemKo: "승무원 사이버 인식 교육 프로그램 운영" },
  ],
  BV: [
    { key: "bv_risk_matrix",       cat: "BV Requirements", catKo: "BV 요건", item: "Cyber risk matrix maintained and reviewed annually per NR659",      itemKo: "NR659에 따른 사이버 위험 매트릭스 관리 및 연간 검토" },
    { key: "bv_zone_conduit",      cat: "BV Requirements", catKo: "BV 요건", item: "Zone and conduit model documented per IEC 62443",                   itemKo: "IEC 62443에 따른 구역 및 도관 모델 문서화" },
    { key: "bv_training",          cat: "BV Requirements", catKo: "BV 요건", item: "Crew cyber awareness training completed and recorded",             itemKo: "승무원 사이버 인식 교육 완료 및 기록" },
    { key: "bv_supply_chain",      cat: "BV Requirements", catKo: "BV 요건", item: "Supply chain cyber security requirements defined for vendors",      itemKo: "공급업체에 대한 공급망 사이버 보안 요건 정의" },
    { key: "bv_continuous_monitor",cat: "BV Requirements", catKo: "BV 요건", item: "Continuous monitoring mechanism for cyber threats in place",         itemKo: "사이버 위협에 대한 지속적 모니터링 메커니즘 운영" },
  ],
  CCS: [
    { key: "ccs_classification",   cat: "CCS Requirements", catKo: "CCS 요건", item: "CCS Ship Cyber System notation applied and scope defined",       itemKo: "CCS 선박 사이버 시스템 부기 적용 및 범위 정의" },
    { key: "ccs_audit",            cat: "CCS Requirements", catKo: "CCS 요건", item: "Annual cyber security audit by CCS-qualified party",              itemKo: "CCS 인정 기관에 의한 연간 사이버 보안 감사" },
    { key: "ccs_supplier",         cat: "CCS Requirements", catKo: "CCS 요건", item: "Supplier cyber security requirements defined and verified",       itemKo: "공급업체 사이버 보안 요건 정의 및 확인" },
    { key: "ccs_emergency_plan",   cat: "CCS Requirements", catKo: "CCS 요건", item: "Cyber emergency contingency plan documented and tested",          itemKo: "사이버 비상 대응 계획 문서화 및 테스트" },
  ],
  NK: [
    { key: "nk_cyber_resilience",  cat: "NK Requirements", catKo: "NK 요건", item: "ClassNK Cyber Resilience guidelines compliance demonstrated",       itemKo: "ClassNK 사이버 복원력 가이드라인 준수 입증" },
    { key: "nk_risk_assessment",   cat: "NK Requirements", catKo: "NK 요건", item: "Cyber risk assessment per ClassNK guidelines (2024)",               itemKo: "ClassNK 가이드라인(2024)에 따른 사이버 위험 평가" },
    { key: "nk_type_approval",     cat: "NK Requirements", catKo: "NK 요건", item: "CBS type approval obtained from ClassNK",                           itemKo: "ClassNK로부터 CBS 형식 승인 취득" },
    { key: "nk_network_topology",  cat: "NK Requirements", catKo: "NK 요건", item: "Onboard network topology diagram submitted and approved",           itemKo: "선내 네트워크 토폴로지 다이어그램 제출 및 승인" },
  ],
};

// ── IACS Ship Locations (설치 위치 — 벤더 입력용) ──
export const SHIP_LOCATIONS = [
  { id: "navigation_bridge", label: "Navigation Bridge", labelKo: "항해 선교(브릿지)", labelJa: "航海ブリッジ" },
  { id: "engine_control_room", label: "Engine Control Room", labelKo: "기관 제어실", labelJa: "機関制御室" },
  { id: "cargo_control_room", label: "Cargo Control Room", labelKo: "화물 제어실", labelJa: "貨物制御室" },
  { id: "engine_room", label: "Engine Room", labelKo: "기관실", labelJa: "機関室" },
  { id: "steering_gear_room", label: "Steering Gear Room", labelKo: "조타기실", labelJa: "操舵機室" },
  { id: "radio_room", label: "Radio Room", labelKo: "통신실", labelJa: "無線室" },
  { id: "server_room", label: "Server/IT Room", labelKo: "서버실/IT실", labelJa: "サーバー室" },
  { id: "safety_centre", label: "Safety Centre", labelKo: "안전 센터", labelJa: "安全センター" },
  { id: "cargo_hold", label: "Cargo Hold", labelKo: "화물창", labelJa: "貨物倉" },
  { id: "ballast_control", label: "Ballast Control Room", labelKo: "밸러스트 제어실", labelJa: "バラスト制御室" },
  { id: "accommodation", label: "Accommodation", labelKo: "거주 구역", labelJa: "居住区" },
  { id: "deck", label: "Open Deck", labelKo: "갑판", labelJa: "甲板" },
  { id: "other", label: "Other", labelKo: "기타", labelJa: "その他" },
] as const;

// ── Access Control Level (접근통제 — 벤더 입력용) ──
export const ACCESS_CONTROL_LEVELS = [
  { id: "restricted", label: "Restricted (Physical + Logical)", labelKo: "제한됨 (물리적 + 논리적 통제)", labelJa: "制限あり（物理+論理）" },
  { id: "physical_only", label: "Physical Access Only", labelKo: "물리적 접근통제만", labelJa: "物理アクセスのみ" },
  { id: "logical_only", label: "Logical Access Only", labelKo: "논리적 접근통제만", labelJa: "論理アクセスのみ" },
  { id: "open", label: "Open (No Access Control)", labelKo: "개방됨 (접근통제 없음)", labelJa: "オープン（制限なし）" },
] as const;

// ── IEC 62443 Zone Types for DFD ──
export type TrustLevel = "trust" | "untrust" | "external";

export const TRUST_LEVEL_CONFIG: Record<TrustLevel, {
  label: string;
  labelKo: string;
  labelJa: string;
  borderClass: string;
  borderColor: string;
}> = {
  trust:    { label: "Trusted",    labelKo: "신뢰", labelJa: "信頼", borderClass: "border-brand", borderColor: "#0F62FE" },
  untrust:  { label: "Untrusted",  labelKo: "비신뢰", labelJa: "非信頼", borderClass: "border-safety-high", borderColor: "#DA1E28" },
  external: { label: "External",   labelKo: "외부", labelJa: "外部", borderClass: "border-text-tertiary", borderColor: "#8D8D8D" },
};

export const MARITIME_ZONES = [
  { id: "navigation", label: "Navigation Zone", labelKo: "항해 구역", labelJa: "航海ゾーン", color: "#0F62FE", trustLevel: "trust" as TrustLevel },
  { id: "propulsion", label: "Propulsion/Engine Control", labelKo: "추진/엔진 제어", labelJa: "推進/エンジン制御", color: "#DA1E28", trustLevel: "trust" as TrustLevel },
  { id: "safety", label: "Safety Systems", labelKo: "안전 시스템", labelJa: "安全システム", color: "#EB6200", trustLevel: "trust" as TrustLevel },
  { id: "cargo", label: "Cargo Management", labelKo: "화물 관리", labelJa: "貨物管理", color: "#F1C21B", trustLevel: "trust" as TrustLevel },
  { id: "communication", label: "Communication", labelKo: "통신", labelJa: "通信", color: "#24A148", trustLevel: "untrust" as TrustLevel },
  { id: "admin", label: "Administrative", labelKo: "행정/업무", labelJa: "管理/事務", color: "#8D8D8D", trustLevel: "untrust" as TrustLevel },
  { id: "shore", label: "Shore Connection", labelKo: "육상 연결 (비신뢰)", labelJa: "陸上接続（非信頼）", color: "#393939", trustLevel: "external" as TrustLevel },
] as const;

// ── Classification Society Details ──
export const SOCIETY_DETAILS = {
  KR: {
    name: "Korean Register",
    nameKo: "한국선급",
    notation: "Cyber Resilience",
    guide: "Cyber Resilience Approval and Survey Guide (Rev.0, 2024)",
    hasTypeApproval: true,
  },
  LR: {
    name: "Lloyd's Register",
    nameKo: "로이드 선급",
    notation: "Cyber Resilience (ShipRight)",
    guide: "ShipRight Cybersecurity Procedures",
    hasTypeApproval: true,
  },
  DNV: {
    name: "DNV",
    nameKo: "DNV",
    notation: "Cyber Secure (Basic/Advanced/+)",
    guide: "DNV-CP-0231 (Dec 2024)",
    hasTypeApproval: true,
  },
  ABS: {
    name: "American Bureau of Shipping",
    nameKo: "미국선급",
    notation: "Cyber Resilience",
    guide: "ABS Cyber Resilience Program FAQ",
    hasTypeApproval: true,
  },
  BV: {
    name: "Bureau Veritas",
    nameKo: "프랑스선급",
    notation: "CYBER SECURE",
    guide: "NR659 Rules on Cyber Security (Jul 2024)",
    hasTypeApproval: true,
  },
  CCS: {
    name: "China Classification Society",
    nameKo: "중국선급",
    notation: "Cyber Resilience",
    guide: "Guidelines on Cybersecurity Onboard Ships",
    hasTypeApproval: true,
  },
  NK: {
    name: "ClassNK (Nippon Kaiji Kyokai)",
    nameKo: "일본선급 (ClassNK)",
    notation: "Cyber Resilience",
    guide: "ClassNK Guidelines for Cyber Resilience of Ships (2024)",
    hasTypeApproval: true,
  },
} as const;

// ── DFD Medium → Protocol → Service/Port Mapping ──

export interface ProtocolInfo {
  id: string;
  label: string;
  labelKo: string;
  defaultPort?: string;
  encrypted?: boolean;
  service?: string;
  serviceKo?: string;
}

export const MEDIUM_PROTOCOLS: Record<string, ProtocolInfo[]> = {
  ethernet: [
    { id: "tcp_ip", label: "TCP/IP", labelKo: "TCP/IP", defaultPort: "80", service: "General network", serviceKo: "일반 네트워크" },
    { id: "udp", label: "UDP", labelKo: "UDP", defaultPort: "161", service: "SNMP / Syslog", serviceKo: "SNMP / Syslog" },
    { id: "modbus_tcp", label: "Modbus TCP", labelKo: "Modbus TCP", defaultPort: "502", service: "Industrial control", serviceKo: "산업 제어" },
    { id: "profinet", label: "PROFINET", labelKo: "PROFINET", defaultPort: "34964", service: "Real-time automation", serviceKo: "실시간 자동화" },
    { id: "ethercat", label: "EtherCAT", labelKo: "EtherCAT", service: "Servo / motion control", serviceKo: "서보/모션 제어" },
    { id: "opc_ua", label: "OPC UA", labelKo: "OPC UA", defaultPort: "4840", encrypted: true, service: "Unified architecture", serviceKo: "통합 아키텍처" },
    { id: "snmp", label: "SNMP", labelKo: "SNMP", defaultPort: "161", service: "Network monitoring", serviceKo: "네트워크 모니터링" },
    { id: "https", label: "HTTPS", labelKo: "HTTPS", defaultPort: "443", encrypted: true, service: "Secure web", serviceKo: "보안 웹" },
    { id: "ssh", label: "SSH", labelKo: "SSH", defaultPort: "22", encrypted: true, service: "Secure shell", serviceKo: "보안 셸" },
  ],
  wireless: [
    { id: "wifi", label: "WiFi (802.11)", labelKo: "WiFi (802.11)", service: "Wireless LAN", serviceKo: "무선 LAN" },
    { id: "bluetooth", label: "Bluetooth", labelKo: "블루투스", service: "Short-range wireless", serviceKo: "근거리 무선" },
    { id: "lte", label: "LTE / 4G", labelKo: "LTE / 4G", service: "Mobile data", serviceKo: "모바일 데이터" },
    { id: "vsat", label: "VSAT", labelKo: "VSAT", service: "Satellite communication", serviceKo: "위성 통신" },
    { id: "inmarsat", label: "Inmarsat", labelKo: "인마샛", service: "Maritime satellite", serviceKo: "해사 위성" },
  ],
  serial: [
    { id: "nmea_0183", label: "NMEA 0183", labelKo: "NMEA 0183", service: "Navigation data", serviceKo: "항해 데이터" },
    { id: "nmea_2000", label: "NMEA 2000", labelKo: "NMEA 2000", service: "Marine electronics", serviceKo: "해양 전자장비" },
    { id: "modbus_rtu", label: "Modbus RTU", labelKo: "Modbus RTU", service: "Serial industrial", serviceKo: "시리얼 산업 통신" },
    { id: "dnp3", label: "DNP3", labelKo: "DNP3", defaultPort: "20000", service: "SCADA / utility", serviceKo: "SCADA / 유틸리티" },
    { id: "iec_101", label: "IEC 60870-5-101", labelKo: "IEC 60870-5-101", service: "Telecontrol", serviceKo: "원격 제어" },
  ],
  fiber: [
    { id: "tcp_ip_fiber", label: "TCP/IP", labelKo: "TCP/IP", defaultPort: "80", service: "General network", serviceKo: "일반 네트워크" },
    { id: "fc", label: "Fibre Channel", labelKo: "파이버 채널", service: "Storage network", serviceKo: "스토리지 네트워크" },
    { id: "sonet", label: "SONET/SDH", labelKo: "SONET/SDH", service: "Backbone transport", serviceKo: "백본 전송" },
  ],
  canbus: [
    { id: "canopen", label: "CANopen", labelKo: "CANopen", service: "Industrial CAN", serviceKo: "산업 CAN" },
    { id: "j1939", label: "SAE J1939", labelKo: "SAE J1939", service: "Engine/vehicle bus", serviceKo: "엔진/차량 버스" },
    { id: "devicenet", label: "DeviceNet", labelKo: "DeviceNet", service: "Automation device", serviceKo: "자동화 장치" },
  ],
  modbus: [
    { id: "modbus_rtu_m", label: "Modbus RTU", labelKo: "Modbus RTU", service: "Serial industrial", serviceKo: "시리얼 산업 통신" },
    { id: "modbus_tcp_m", label: "Modbus TCP", labelKo: "Modbus TCP", defaultPort: "502", service: "TCP industrial", serviceKo: "TCP 산업 통신" },
    { id: "modbus_ascii", label: "Modbus ASCII", labelKo: "Modbus ASCII", service: "ASCII industrial", serviceKo: "ASCII 산업 통신" },
  ],
};
