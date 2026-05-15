# Study App

An immersive focus workspace with Pomodoro timer, ambient video scenes, music, and task capture.

**Live:** [study.je1ght.top](https://study.je1ght.top)

## Local Development

### Prerequisites
- Node.js 24+
- Docker (for MySQL)

### Setup

```bash
# Start MySQL
cd infra/local-db
docker compose up -d

# Setup server
cd server
cp .env.example .env
npm install
npx prisma migrate dev --name init
npm run dev

# Setup client (new terminal)
cd client
npm install
npm run dev
```

Client runs at `http://localhost:5173`, API at `http://localhost:3002`.

## Deploy

```bash
bash scripts/deploy.sh
```

## Tech Stack

- React 19 + Vite 8
- Hono + Prisma + MySQL
- Docker + nginx
- Cloudflare CDN
