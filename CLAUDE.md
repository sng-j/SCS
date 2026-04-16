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

## 프로젝트 구조

```
src/
├── app/
│   ├── api/            # API 라우트 (REST)
│   ├── (auth)/         # 로그인/온보딩 페이지
│   └── (dashboard)/    # 인증 후 메인 페이지들
│       ├── admin/      # 관리자 (사용자, 설정, 보안로그)
│       ├── project/    # 프로젝트별 기자재/평가/DFD
│       ├── shipyard/   # 조선소 워크플로우
│       ├── vendor/     # 벤더 워크플로우
│       └── fleet/      # 선대 관리
├── lib/                # 공유 유틸리티
│   ├── auth.ts         # NextAuth 설정 + IP whitelist + 로그인 잠금
│   ├── prisma.ts       # Prisma 클라이언트
│   ├── i18n.ts         # 다국어 (한/영)
│   └── ...             # AI, 스캔 파서, PDF/docx 생성 등
└── middleware.ts        # 인증 체크 + CSP 헤더
prisma/
├── schema.prisma       # DB 스키마
└── seed.ts             # 초기 데이터
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

# 3. 환경변수 (.env, .env.local은 .gitignore됨 — 절대 커밋하지 않는다)
cp .env.example .env        # 형식 참고용
# .env.local에 실제 값 채우기 (아래 환경변수 섹션 참고)

# 4. Prisma
npx prisma generate
npx prisma db push
npx tsx prisma/seed.ts

# 5. 개발 서버 (LAN 접근 필요 시 -H 0.0.0.0)
npx next dev -H 0.0.0.0 -p 7000
```

## 환경변수 (.env.local)

| 변수 | 설명 | 예시 |
|------|------|------|
| `DATABASE_URL` | MySQL 연결 문자열 | `mysql://scs:pw@localhost:3307/scs_db` |
| `APP_HOST` | LAN에서 접근하는 호스트 (HMR 허용용) | `192.168.100.22` |
| `AUTH_SECRET` | NextAuth 세션 암호키 (`openssl rand -base64 32`) | (랜덤 문자열) |
| `AUTH_TRUST_HOST` | 여러 호스트(IP)로 접근 시 Host 헤더 신뢰 | `true` |
| `LLM_API_URL` | AI 기능용 LLM 엔드포인트 (선택) | |
| `ANTHROPIC_API_KEY` | Claude API 키 (선택) | |

## 시드 계정 (개발용)

| Email | Role | Password |
|-------|------|----------|
| admin@cytur.net | ADMIN | 123123 |
| shipyard@cytur.kr | SHIPYARD | password123 |
| vendor@cytur.kr | VENDOR | password123 |

## 주의사항

- 쿠키 `secure` 플래그와 CSP는 `NODE_ENV`에 따라 자동 분기된다.
  - `dev`: HTTP 허용, unsafe-eval/ws: 허용 (React HMR용)
  - `production`: HTTPS 전용, strict CSP
- `.env`, `.env.local` 등 환경변수 파일은 `.gitignore`에 포함돼 있다. 커밋하지 않는다.
- `next-env.d.ts`는 Next.js가 자동 생성한다. 수동 수정하지 않는다.
