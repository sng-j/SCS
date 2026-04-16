# SCS - Ship Cyber Security

IACS UR E26/E27 기반 선박 사이버 보안 컴플라이언스 관리 시스템.

## Quick Start

```bash
npm install
npx prisma db push
npm run dev
```

## Tech Stack

- Next.js 16 + React 19 + TypeScript
- Prisma + SQLite
- NextAuth v5
- Tailwind CSS 4

## Roles

- **ADMIN** - 시스템 관리
- **SHIPYARD** - 프로젝트/호선 관리, 벤더 배정
- **VENDOR** - 기자재 등록, 보안 진단
