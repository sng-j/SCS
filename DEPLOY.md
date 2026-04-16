# SCS 배포 매뉴얼 (Naver Cloud)

## 1. 서버 요구사항

| 항목 | 최소 사양 |
|------|----------|
| OS | Ubuntu 22.04+ |
| Node.js | v20+ (LTS) |
| MySQL | 8.0+ |
| RAM | 2GB+ |
| Disk | 20GB+ |

## 2. 서버 초기 설정

```bash
# Node.js 설치 (nvm 권장)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20

# pm2 설치 (프로세스 관리)
npm install -g pm2

# MySQL 설치 (또는 Naver Cloud DB for MySQL 사용)
sudo apt update
sudo apt install -y mysql-server
sudo mysql_secure_installation
```

## 3. MySQL 데이터베이스 생성

```sql
-- MySQL 접속
mysql -u root -p

-- DB 및 사용자 생성
CREATE DATABASE scs_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'scs'@'localhost' IDENTIFIED BY '강력한비밀번호';
GRANT ALL PRIVILEGES ON scs_db.* TO 'scs'@'localhost';
FLUSH PRIVILEGES;
```

> Naver Cloud DB for MySQL 사용 시 `localhost` 대신 DB 엔드포인트 주소 사용

## 4. 프로젝트 배포

```bash
# 압축 파일 업로드 후 해제
tar -xzf scs-deploy.tar.gz
cd SCS

# 의존성 설치
npm install --production=false

# Prisma 클라이언트 생성
npx prisma generate
```

## 5. 환경변수 설정

`.env` 파일 생성 (Prisma CLI 전용):

```bash
cat > .env << 'EOF'
DATABASE_URL="mysql://scs:강력한비밀번호@localhost:3306/scs_db"
EOF
```

`.env.local` 파일 생성 (런타임 전체):

```bash
cat > .env.local << 'EOF'
# Database
DATABASE_URL="mysql://scs:강력한비밀번호@localhost:3306/scs_db"

# App Host (서버 공인IP 또는 도메인)
APP_HOST="서버IP또는도메인"

# NextAuth (AUTH_SECRET은 아래 명령으로 생성)
AUTH_SECRET="여기에_생성된_시크릿"
AUTH_URL="http://서버IP또는도메인:7000"

# LLM (Ollama 사용 시, 미사용 시 비워두기)
LLM_API_URL=""
LLM_MODEL=""
LLM_API_KEY=""

# Upload directory (기본값: 프로젝트 내 uploads/)
# 영구 볼륨 마운트 시 경로 변경
# UPLOAD_DIR="/mnt/data/uploads"

ANTHROPIC_API_KEY=""
EOF
```

AUTH_SECRET 생성:

```bash
openssl rand -base64 32
```

## 6. DB 스키마 동기화 및 시드

```bash
# 스키마 push (테이블 생성)
npx prisma db push

# 초기 데이터 (관리자/테스트 계정)
npx tsx prisma/seed.ts
```

### 시드 계정

| Email | Role | Password |
|-------|------|----------|
| admin@cytur.net | ADMIN | 123123 |
| shipyard@cytur.kr | SHIPYARD | password123 |
| vendor@cytur.kr | VENDOR | password123 |

> 배포 후 반드시 비밀번호 변경

## 7. 빌드 및 실행

```bash
# 프로덕션 빌드
npm run build

# pm2로 실행 (포트 7000)
pm2 start "npx next start -p 7000" --name scs
pm2 save
pm2 startup  # 서버 재시작 시 자동 실행
```

## 8. Nginx 리버스 프록시 (선택)

```bash
sudo apt install -y nginx
```

`/etc/nginx/sites-available/scs` 파일 생성:

```nginx
server {
    listen 80;
    server_name 서버IP또는도메인;

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";

    proxy_connect_timeout 60s;
    proxy_send_timeout 120s;
    proxy_read_timeout 120s;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:7000;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/scs /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
```

> Nginx 사용 시 `AUTH_URL`을 `http://서버IP또는도메인` (포트 없이)으로 변경

## 9. 방화벽 설정

```bash
# Naver Cloud ACG(방화벽)에서 허용할 포트
# - 80 (HTTP, Nginx 사용 시)
# - 7000 (Next.js 직접 접근 시)
# - 22 (SSH)
# - 3306 (MySQL, 외부 접근 필요 시만)
```

## 10. 배포 후 확인

```bash
# 서비스 상태 확인
pm2 status

# 로그 확인
pm2 logs scs

# 빌드 정상 여부
curl -s http://localhost:7000 | head -5

# uploads 디렉토리 권한 확인
ls -la uploads/
```

## 11. 업데이트 배포

```bash
# 새 소스 업로드 후
npm install
npx prisma generate
npx prisma db push    # 스키마 변경 있을 때만
npm run build
pm2 restart scs
```

## 12. 트러블슈팅

| 증상 | 해결 |
|------|------|
| DB 연결 실패 | `.env`와 `.env.local` 양쪽에 `DATABASE_URL` 설정 확인 |
| 로그인 안됨 | `AUTH_SECRET`, `AUTH_URL` 확인. IP 화이트리스트 초기화: `mysql -e "DELETE FROM IpWhitelist;" scs_db` |
| 파일 업로드 실패 | `uploads/` 디렉토리 쓰기 권한 확인: `chmod 755 uploads/` |
| 502 Bad Gateway | pm2 상태 확인: `pm2 status`, 포트 충돌 확인: `lsof -i :7000` |
| 빌드 메모리 부족 | `NODE_OPTIONS="--max-old-space-size=4096" npm run build` |
