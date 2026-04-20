# SCS (Ship Cyber Security)

선박 사이버 보안 관리 시스템. 조선소/벤더/선급 등이 기자재 보안 인증 프로세스를 관리한다.

## Tech Stack

- **Framework**: Next.js 16 (App Router, Turbopack)
- **Language**: TypeScript
- **DB**: MySQL 8.0 + Prisma ORM
- **Auth**: NextAuth v5 (Credentials, JWT 세션)
- **UI**: Tailwind CSS 4, Lucide icons, Framer Motion, Sonner(toast)
- **State**: Zustand, React Hook Form + Zod
- **기타**: @xyflow/react(DFD 다이어그램), TipTap(에디터), ExcelJS, PDFKit, docx

## Git 브랜치 전략

- **`main`**: 운영(production) 배포 전용. 안정된 버전만 머지한다.
- **`dev`**: 개발 브랜치. 모든 작업은 `dev`에서 한다.
- 커밋/푸시는 `dev`에 하고, 충분히 검증된 후 `main`으로 머지.
- `main`에 직접 커밋하지 않는다.

## 역할 체계 (중요)

4단계 역할. write 권한과 read-only 뷰어가 분리되어 있다.

| Role | 의미 | 권한 |
|------|------|------|
| **ADMIN** | 시스템 관리자 | 전부. Admin 패널 (사용자/조선소/설정/로그/선급KB/문서포맷) |
| **SUPPORT** | 조선소 담당자 (실무자) | 자기 조선소의 프로젝트·벤더 관리, 기자재 리뷰/승인, Q&A 답변 |
| **SHIPYARD** | 조선소 뷰어 (읽기 전용) | 자기 조선소 데이터 열람만 가능. `/viewer` 전용 UI로 라우트됨 |
| **VENDOR** | 기자재 벤더 | 자기 장비의 HW/SW 등록, 평가, 문서 생성, 제출 |

- 로그인 시 SHIPYARD는 `/viewer`로 자동 리다이렉트.
- SHIPYARD는 편집 버튼이 전부 숨겨지고, 사이드바 메뉴도 축소됨.
- 권한 검사: API 쓰기 작업은 `role !== "SUPPORT" && role !== "ADMIN"` 체크. 읽기는 SHIPYARD도 허용.
- CSV/엑셀 붙여넣기 일괄 등록: Admin에서 ADMIN/SUPPORT/SHIPYARD/VENDOR 각 역할별로 가능.

## 프로젝트 구조

```
src/
├── app/
│   ├── api/            # API 라우트 (REST, 150+ 엔드포인트)
│   ├── (auth)/         # 로그인/회원가입/비번 변경
│   └── (dashboard)/    # 인증 후 메인 페이지들
│       ├── admin/      # 관리자 패널 (10+ 탭)
│       ├── project/    # 프로젝트별 기자재/평가/DFD/문서/제출
│       ├── shipyard/   # SUPPORT용 벤더 관리
│       ├── vendor/     # 벤더 포털 (템플릿, 내보내기)
│       ├── fleet/      # 선대 전체 현황
│       └── viewer/     # SHIPYARD(뷰어) 전용 3-클릭 계층 UI
├── lib/                # 공유 유틸리티
│   ├── auth.ts         # NextAuth 설정 + IP whitelist + 로그인 잠금
│   ├── auth-helpers.ts # verifyProjectAccess 등 권한 헬퍼
│   ├── prisma.ts       # Prisma 클라이언트
│   ├── i18n.ts         # 다국어 (한/영/일)
│   ├── docx/           # 36개 문서 타입 생성기 (E27/E26/IEC/NIST/ISO)
│   └── ...             # AI, 스캔 파서, PDF/docx 생성, 데이터 정합성 등
├── components/
│   ├── ui/             # Card, Button, Dialog, ErrorScreen 등 공용
│   └── ...
└── middleware.ts        # 인증 체크 + CSP 헤더 + 0.0.0.0 → localhost 리다이렉트
prisma/
├── schema.prisma       # 47개 모델
└── seed.ts             # 초기 데이터 (테스트 조선소/벤더/프로젝트/장비)
```

## 로컬 개발 환경 세팅

```bash
# 1. 의존성 설치
npm install

# 2. Docker MySQL (포트 3307, 시스템 MySQL과 충돌 방지)
docker run -d --name scs-mysql \
  -e MYSQL_ROOT_PASSWORD=<비밀번호> \
  -e MYSQL_DATABASE=scs_db \
  -e MYSQL_USER=scs \
  -e MYSQL_PASSWORD=<비밀번호> \
  -p 3307:3306 --restart unless-stopped mysql:8.0

# 3. 환경변수
cp .env.example .env.local    # 복사 후 실제 값 채우기
cp .env.example .env           # Prisma CLI용 (DATABASE_URL만 있으면 됨)

# 4. Prisma
npx prisma generate
npx prisma db push
npx tsx prisma/seed.ts

# 5. 개발 서버 (LAN 접근 필요 시 -H 0.0.0.0)
npx next dev -H 0.0.0.0 -p 7000
```

접속은 `http://localhost:7000` 또는 `http://<LAN_IP>:7000`. `http://0.0.0.0:7000`은 미들웨어가 자동으로 localhost로 리다이렉트한다.

## 환경변수 (.env.local)

`.env.example` 파일 참고. 주요 변수:

| 변수 | 설명 |
|------|------|
| `DATABASE_URL` | MySQL 연결 문자열 (포트 3307 Docker 기본값) |
| `APP_HOST` | LAN 접속용 호스트 (HMR 허용, Next.js allowedDevOrigins) |
| `AUTH_SECRET` | NextAuth 세션 암호키 (`openssl rand -base64 32`) |
| `AUTH_TRUST_HOST` | LAN/멀티호스트 개발 시 `true` |
| `LLM_API_URL` / `LLM_MODEL` / `LLM_API_KEY` | AI 오케스트레이터 (선택) |
| `ANTHROPIC_API_KEY` | 문서 AI 개선 기능 (선택) |

## 시드 계정 (개발용)

| Email | Role | Password |
|-------|------|----------|
| admin@cytur.net | ADMIN | 123123 |
| shipyard@cytur.kr | SUPPORT | password123 |
| viewer@cytur.kr | SHIPYARD (뷰어) | password123 |
| vendor@cytur.kr | VENDOR | password123 |

## 문서 시스템

38개 문서 타입, 5개 표준:
- **E27** (13개, 벤더가 생성): CBS, SBOM, AUD, TOP, VUL, ACC, MON, CFG, TST, SDL, MNT, INC, MOC
- **E26** (9개, 조선소가 생성): ZCD, INV, CRA, CSD, CRP, CMP, RAP, SSL, TRA
- **IEC 62443** (5개), **NIST SP 800** (4개), **ISO 27001** (8개)

4개는 전용 생성기(CBS/SBOM/AUD/TOP), 나머지 34개는 `gen-template.ts`의 focus 분기로 생성. 모두 실제 DB 데이터(HW/SW/평가/CVE/연결)를 자동 주입한다.

## 보안 주의사항

- 쿠키 `secure` 플래그와 CSP는 `NODE_ENV`에 따라 자동 분기 (dev: HTTP/unsafe-eval 허용, production: HTTPS + strict CSP)
- `.env`, `.env.local` 등 환경변수 파일은 `.gitignore`에 포함돼 있다. 커밋하지 않는다.
- `before/` 폴더는 구버전 PHP 소스로 `.gitignore`됨. 참고용으로만 로컬 보관.
- `next-env.d.ts`는 Next.js가 자동 생성. 수동 수정 금지.
- 에러 페이지(`ErrorScreen` 컴포넌트)는 프로덕션에서 `error.message`/stack trace를 노출하지 않고 `error.digest`만 참조 ID로 보여준다.
- 로그인 실패는 `LOCKED` / `INVALID_CREDENTIALS` 2가지로만 응답 (사용자 열거 방지).
