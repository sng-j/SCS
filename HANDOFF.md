# SCS 변경사항 인수인계 문서

작성일: 2026-04-20
작성자: sng_j

---

## 1. 개요

본 문서는 SCS(Ship Cyber Security) 시스템에 추가/수정된 주요 기능을 정리한 인수인계 자료입니다. 크게 **4가지 영역**의 변경이 있었습니다:

1. **Test Procedure (테스트 절차)** — 새 워크플로우 스텝 추가
2. **CVE/Exploit 데이터 통합** — NVD 연동 + 자동 매칭
3. **Risk 자동 생성** — CVE 기반 리스크 자동 생성 + 인라인 편집
4. **CVE 자산 매칭 고도화** — 알려진 제품 카탈로그 + 정밀 매칭

---

## 2. DB 스키마 변경

### 신규 모델

| 모델 | 용도 |
|---|---|
| `TestProcedure` | 기자재별 테스트 절차 레코드 (MANUAL/UPLOADED) |
| `TestProcHwGroup` | 하드웨어 그룹 (여러 HW를 묶어서 공통 점검 항목 적용) |
| `TestProcedureHwItem` | 그룹별 HW 점검 항목 (분류/기준/방법) |
| `TestProcedureFnItem` | SW별 기능 점검 항목 (섹션별 관리) |

### 기존 모델 수정

**`RiskEntry`** — `cveId` 필드 추가 (optional)
- CVE에서 자동 생성된 리스크와 수동 리스크 구분
- CVE 매칭 삭제 시 cascade 삭제

---

## 3. Test Procedure 기능

### 워크플로우 위치

```
자산 등록 → DFD → 보안 평가 → [Test Procedure] → 문서 생성 → 제출
```

### 경로

- **벤더 입력**: `/project/[projectId]/testproc?equipmentId=...`
- **조선소 조회**: 기자재 상세 페이지 → Test Procedure 탭

### 주요 기능

**문서 업로드 모드** (상단 드래그 앤 드롭 존)
- Word / PowerPoint / PDF 업로드 → 업로드 완료 시 직접 입력 비활성화

**하드웨어 점검 (Step 1)**
- 공통 테스트 항목 (그룹 무관)
- HW 그룹 생성 UI: 좌측 타입별 분류 + 우측 개별 HW 체크박스 + 하단 선택 태그 + 그룹명 입력 + 생성
- 그룹별 독립된 점검 항목 테이블 (NO/CATEGORY/CRITERIA/METHOD)

**기능 점검 (Step 2)**
- SW 드롭다운 → SW별 섹션 관리 → 항목 입력
- 각 SW마다 독립적인 섹션 목록 (사용자 정의)

### API 라우트 (신규)

| 메소드 | 경로 | 설명 |
|---|---|---|
| GET/POST | `/api/projects/[projectId]/test-procedure` | 조회/자동 생성 |
| POST/DELETE | `/api/projects/[projectId]/test-procedure/upload` | 파일 업로드/삭제 |
| PUT | `/api/projects/[projectId]/test-procedure/hw-items` | 그룹별 HW 항목 저장 |
| PUT | `/api/projects/[projectId]/test-procedure/fn-items` | SW별 FN 항목 저장 |
| POST/DELETE | `/api/projects/[projectId]/test-procedure/hw-groups` | HW 그룹 CRUD |

### 핵심 파일

- UI: `src/app/(dashboard)/project/[projectId]/testproc/page.tsx`
- 조선소 뷰 통합: `src/components/shipyard/vessel-detail.tsx` (탭 + MiniStat)
- 리뷰 페이지: `src/app/(dashboard)/project/[projectId]/review/page.tsx`
- 워크플로우 컴포넌트: `src/components/ui/workflow-steps.tsx`

---

## 4. CVE/Exploit 데이터 통합

### 환경변수 추가

```
NVD_API_KEY="2e1a6c57-72c2-41c6-a890-6f7e5449315a"
```
`.env` 및 `.env.local` 모두 필요. API 키로 rate limit 50 req/30s 확보.

### 현재 데이터 (2026-04-20 기준)

| 테이블 | 건수 |
|---|---|
| CveLocal | 43,614 |
| CveLocal (CRITICAL) | 2,403 |
| CveLocal (HIGH) | 13,075 |
| ExploitRef | 1,000 |

### 동기화 스크립트

**`scripts/sync-cve-maritime.ts`** — 해양/산업 벤더 대상 초기 동기화
- 40+ 벤더 키워드 (siemens, fortinet, cisco, microsoft, linux 등)
- 첫 실행 30분 소요. 이후 증분 동기화 가능
- 사용: `npx tsx scripts/sync-cve-maritime.ts`

**`/api/cve/sync`** (ADMIN 전용) — NVD 배치 동기화 API
- BATCH_SIZE: API 키 있으면 2000, 없으면 100
- `CveSyncState` 테이블이 pagination 상태 관리

### CVE 관리자 페이지

**`/admin/cve`** — 기존 페이지 (이미 구현되어 있음)
- CVE 검색 (severity/vendor/product 필터)
- Exploit 레퍼런스 관리
- CVE 상세 다이얼로그 (NVD/Exploit-DB 외부 링크)

---

## 5. CVE 자동 매칭 시스템

### 핵심 로직

**`src/lib/cve-auto-match.ts`** — SW/HW 생성/수정 시 자동 호출

매칭 우선순위:
1. **CPE 정확 매칭** (CPE가 입력된 경우)
2. **카탈로그 매칭** (`KNOWN_PRODUCTS` 조회) ← 최우선 fallback
3. **HW manufacturer + SW name 조합**
4. **Self-match** (vendor=name, product=name)

### 알려진 제품 카탈로그

**`src/lib/known-products.ts`**
- `KNOWN_PRODUCTS`: 약 120개 (OS, Network, Security, Industrial, Database 등)
- `KNOWN_HARDWARE`: 약 160개 (구체적 모델명 포함: FortiGate-40F, Catalyst 9300 등)

### 카탈로그 매칭 특징
- Case-insensitive
- 부분 일치 (label/product/vendor 기반)
- 버전 prefix 자동 확장 (예: `windows_11` → `windows_11_22h2`, `windows_11_23h2`)

### 버전 필터링

**`isVersionAffected()`**: SW 버전이 CVE의 versionStart~versionEnd 범위 안에 있는지 검사

**흔한 제품 fallback**:
- 버전 미입력 + 후보 50개 초과 → CRITICAL/HIGH만 top 50
- 카탈로그 매칭 후 버전 필터로 0개가 되면 → CRITICAL/HIGH top 20 fallback

### 호출 지점 (모두 await 동기화)

| API | 호출되는 함수 |
|---|---|
| `POST /api/projects/[projectId]/software` | `autoMatchCveForSoftware()` |
| `PATCH /api/projects/[projectId]/software/[softwareId]` | `autoMatchCveForSoftware()` |
| `POST /api/projects/[projectId]/hardware` | `autoMatchCveForHardware()` + 자동 생성 SW 매칭 |
| `PATCH /api/projects/[projectId]/hardware/[hardwareId]` | HW 매칭 + 시스템 SW 매칭 |

재매칭 시 **기존 auto 매칭 + 연결된 Risk 모두 삭제** 후 새로 매칭 (cascade 보장).

### 관리자 재매칭 스크립트

**`scripts/auto-match-cve.ts`** — 전체 프로젝트 일괄 재매칭
- 사용: `npx tsx scripts/auto-match-cve.ts`
- 2단계 매칭 (HW exact model → SW catalog)

---

## 6. Risk 자동 생성 시스템

### CVSS → Risk 매핑

| CVSS baseScore | likelihood | | baseSeverity | impact |
|---|---|---|---|---|
| 9.0+ | 5 | | CRITICAL | 5 |
| 7.0+ | 4 | | HIGH | 4 |
| 4.0+ | 3 | | MEDIUM | 3 |
| 2.0+ | 2 | | LOW | 2 |
| 그 외 | 1 | | NONE/null | 1 |

`riskLevel = likelihood × impact` 자동 계산.

### 자동 생성 범위
- **자동**: threatId (T-001, T-002...), cveId, assetRef, likelihood, impact, riskLevel
- **사용자 수동 조정**: likelihood/impact 드롭다운 변경, mitigation 입력, status 변경

### UI 편집 (보안평가 페이지 리스크 탭)

**`src/app/(dashboard)/project/[projectId]/assess/page.tsx`** — RiskTab

테이블 형식으로 표시, 각 행에서 인라인 편집:
- likelihood / impact 드롭다운 (즉시 API PATCH)
- status 드롭다운 (OPEN/MITIGATED/ACCEPTED/TRANSFERRED)
- Score 자동 재계산 + 매트릭스 갱신

### API

| 메소드 | 경로 | 설명 |
|---|---|---|
| POST | `/api/projects/[projectId]/risks/generate-from-cve` | CVE로부터 리스크 일괄 생성 |
| PATCH | `/api/projects/[projectId]/risks/[riskId]` | 인라인 편집 |

### CVE 삭제 시 Risk cascade

**`DELETE /api/projects/[projectId]/cve-matches?id=N`** — CVE 매칭 삭제
- 같은 프로젝트 + 같은 cveId의 RiskEntry도 함께 삭제

---

## 7. Inventory CVE 사이드바

**위치**: 인벤토리 페이지 HW 테이블의 CVE 카운트 클릭

**기능**:
- 해당 HW 및 그에 속한 SW의 CVE 매칭 목록 표시
- 각 CVE: ID (NVD 링크), Severity 뱃지, CVSS 점수, SW 정보, 설명, 게시일
- 휴지통 버튼: CVE 매칭 삭제 → 연결된 Risk도 자동 삭제

**CVE 카운트 계산**:
- HW 직접 매칭 (`_count.cveMatches`) + 하위 SW 매칭 (`swCveCount`)
- 모두 `deletedAt: null` 필터 적용

---

## 8. HW/SW 등록 시 알려진 제품 선택

### 신규 등록 다이얼로그

**HW 다이얼로그 (`src/components/inventory/hw-dialog.tsx`)**
- 상단 파란색 검색창 (수정 모드 제외)
- "FortiGate" 검색 → 선택 → name, manufacturer, type 자동 채움

**SW 다이얼로그 (`src/components/inventory/sw-dialog.tsx`)**
- 상단 보라색 검색창
- "Windows 11" 선택 → name, vendor, swType, CPE 자동 채움

### 슬라이드 편집 패널

인벤토리 테이블 클릭 시 우측 패널에서 편집 가능:
- **제조사 필드 포커스** → 카테고리별 HW 목록 드롭다운 (Firewall / Switch / Server / Industrial 등)
- **모델 필드 포커스** → 선택된 제조사의 모델만 필터링
- **System SW 필드 포커스** → 카테고리별 SW 목록 (OS / Network / Database 등)

### 검색 API

**`/api/cve/products`**
- `?kind=sw|hw&q=<query>&swType=<type>&hwType=<type>`
- 퍼지 매칭 지원 (예: "simense" → "siemens" 매칭)
- 응답: `{ items: [...], grouped: { category: [...] } }`

---

## 9. 중요 버그 수정 (2026-04-20)

CVE 매칭 시스템 종합 버그 수정:

| # | 버그 | 수정 내용 |
|---|------|----------|
| 1 | `_count.cveMatches`가 soft-deleted 포함 | 모든 `_count` 쿼리에 `where: { deletedAt: null }` 추가 |
| 2 | cve-matches GET API가 deleted 포함 | HW/SW의 deletedAt도 함께 체크 |
| 3 | 카탈로그 매칭 case-sensitive | 4단계 fallback 로직 |
| 4 | 버전 정규화 문제 | 카탈로그 매칭 시 filter fallback |
| 5 | 매칭 비동기로 UI 갱신 지연 | 모든 매칭 함수 `await` (sync) |
| 6 | 재매칭 시 옛 매칭 잔존 | 함수 진입 즉시 delete 보장 |
| 7 | 흔한 제품 버전 없음 | top CRITICAL/HIGH 50건 fallback |
| 8 | UI 데이터 불일치 | API 응답 일관성 확보 |

---

## 10. 테스트

### 자동 테스트

**`scripts/test-cve-matching.ts`** — 9가지 시나리오 자동 검증
- 사용: `npx tsx scripts/test-cve-matching.ts`

검증 항목:
1. Windows Server 2022 카탈로그 매칭
2. FortiOS 버전 필터링 (104 → 23건)
3. Case-insensitive 매칭 (`fortios` vs `FortiOS`)
4. SW 이름 변경 시 옛 매칭 정리
5. Generic 이름 (`Firmware`) 스킵
6. 존재하지 않는 제품 → 0건
7. HW 모델 변경 시 cascade cleanup
8. 리스크 자동 생성
9. Soft-delete `_count` 필터

### 수동 테스트 시나리오

자세한 내용은 `/home/ubuntu/.claude/plans/drifting-riding-turtle.md` 참고.

---

## 11. 배포 절차

### 1. DB 변경 반영

```bash
cd /home/ubuntu/SCS
npx prisma generate
npx prisma db push
```

### 2. 빌드 + 재시작

```bash
npx next build
pm2 restart scs
```

### 3. 초기 CVE 데이터 동기화 (최초 1회)

```bash
# NVD_API_KEY가 .env에 있는지 확인
npx tsx scripts/sync-cve-maritime.ts
```

### 4. 기존 자산 재매칭 (선택)

```bash
# 주의: 기존 auto CVE 매칭과 리스크를 모두 삭제하고 재생성
npx tsx scripts/auto-match-cve.ts
```

---

## 12. 주요 파일 맵

### DB
- `prisma/schema.prisma` — TestProcedure 3개 모델 + RiskEntry.cveId

### 라이브러리
- `src/lib/cve-auto-match.ts` — CVE 자동 매칭 + 리스크 생성 핵심 로직
- `src/lib/known-products.ts` — 알려진 SW/HW 카탈로그

### API 라우트
- `src/app/api/cve/sync/route.ts` — NVD 동기화
- `src/app/api/cve/products/route.ts` — 제품 검색
- `src/app/api/projects/[projectId]/test-procedure/` — 테스트 절차 CRUD
- `src/app/api/projects/[projectId]/cve-matches/route.ts` — CVE 매칭 CRUD
- `src/app/api/projects/[projectId]/risks/generate-from-cve/route.ts` — 리스크 자동 생성
- `src/app/api/projects/[projectId]/hardware/route.ts` — 자동 매칭 호출
- `src/app/api/projects/[projectId]/software/route.ts` — 자동 매칭 호출

### UI
- `src/app/(dashboard)/project/[projectId]/testproc/page.tsx` — 테스트 절차 입력
- `src/app/(dashboard)/project/[projectId]/inventory/page.tsx` — CVE 사이드바, 제품 선택 드롭다운
- `src/app/(dashboard)/project/[projectId]/assess/page.tsx` — 리스크 탭 인라인 편집
- `src/components/inventory/hw-dialog.tsx` / `sw-dialog.tsx` — 알려진 제품 선택
- `src/components/shipyard/vessel-detail.tsx` — 조선소 뷰 테스트 절차 탭

### 스크립트
- `scripts/sync-cve-maritime.ts` — 해양/산업 CVE 초기 동기화
- `scripts/auto-match-cve.ts` — 전체 자산 재매칭
- `scripts/test-cve-matching.ts` — 회귀 테스트

### 설정
- `tsconfig.json` — `"exclude": ["node_modules", "scripts"]` (scripts 빌드 제외)
- `.env` — `NVD_API_KEY` 필요

---

## 13. 운영 주의사항

### PM2 관리

```bash
pm2 status                # 상태 확인
pm2 logs scs --lines 50   # 로그 확인
pm2 restart scs           # 재시작
```

PM2가 `.next/BUILD_ID`를 못 찾아 errored 상태면 빌드 먼저 완료 후 재시작.

### CVE 카운트가 안 맞는 경우

Soft-delete 관련 문제일 가능성. DB 직접 확인:

```sql
SELECT h.name,
  (SELECT COUNT(*) FROM CveMatch WHERE hardwareId=h.id AND deletedAt IS NULL) as active,
  (SELECT COUNT(*) FROM CveMatch WHERE hardwareId=h.id) as total
FROM Hardware h WHERE h.deletedAt IS NULL
HAVING active != total;
```

차이가 있으면 deleted 레코드 존재 → UI 새로고침 필요.

### 매칭이 안 되는 경우

1. SW/HW 저장 후 자동 매칭 실행됨 (await)
2. CPE 또는 name이 카탈로그와 매칭되는지 확인
3. 수동 재실행: `npx tsx scripts/auto-match-cve.ts`
4. 테스트: `npx tsx scripts/test-cve-matching.ts`

### 버전 형식

- 숫자와 점만 추출하여 비교 (`7.0.12M` → `7.0.12`)
- Windows 빌드 번호 (`20348.1`, `10.0.19044` 등)는 카탈로그 product prefix 매칭으로 처리
- 버전 미입력 시 top CRITICAL/HIGH 50건으로 fallback

---

## 14. 알려진 제약사항

1. **NVD 데이터 한계**: 최신 제품(예: Windows Server 2026)은 CVE 데이터가 NVD에 없을 수 있음
2. **일부 중복 매칭**: 한 CVE가 여러 asset에 매칭되면 같은 RiskEntry 재사용 (중복 방지)
3. **ATEN 등 일부 벤더**: NVD에 등록된 CVE가 없어 매칭 불가 — 카탈로그에 포함해도 결과 0건
4. **CVE 매칭 trigger**: SW/HW 저장 시에만 작동. NVD 신규 CVE 추가 시 기존 자산은 수동 재매칭 필요

---

## 15. 문의

- 코드 위치: `/home/ubuntu/SCS`
- 상세 변경 계획: `/home/ubuntu/.claude/plans/drifting-riding-turtle.md`
- Git 브랜치: `dev` (운영 배포는 `main`으로 머지 후)
