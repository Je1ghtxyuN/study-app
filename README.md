<div align="right">
  <a title="中文" href="/README_CN.md">中文</a>
</div>

<div align="center">

<img src="assets/study-icon.svg" width="100" height="100" alt="Study Room Logo" />

# Study Room

An immersive focus workspace with Pomodoro timer, ambient scenes, music, and task capture.

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)
![Hono](https://img.shields.io/badge/Hono-4-FF6B35?logo=hono&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma&logoColor=white)
![MySQL](https://img.shields.io/badge/MySQL-8.0-4479A1?logo=mysql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)
![Nginx](https://img.shields.io/badge/Nginx-Alpine-009639?logo=nginx&logoColor=white)
![Cloudflare](https://img.shields.io/badge/Cloudflare-CDN-F38020?logo=cloudflare&logoColor=white)

**Live**: [study.je1ght.top](https://study.je1ght.top)

</div>

---

## Features

- **Pomodoro Timer** — Configurable work/break durations with session tracking
- **Ambient Scenes** — Video backgrounds for immersive focus environments
- **Music Player** — Integrated playlist support via NetEase Cloud Music
- **Task Capture** — Quick todo list for capturing thoughts without breaking flow
- **Statistics** — Daily and cumulative study session analytics with calendar view
- **Multi-language** — English, Simplified Chinese, Traditional Chinese, Japanese
- **Authentication** — Email/password and GitHub OAuth login
- **Responsive** — Adaptive layout for desktop and mobile

## Tech Stack

| Layer | Technology | Role |
|-------|-----------|------|
| **Frontend** | React 19 + Vite 8 | SPA with fast HMR and optimized builds |
| **Routing** | react-router-dom 7 | Client-side routing |
| **Backend** | Hono | Lightweight, high-performance web framework |
| **ORM** | Prisma 6 | Type-safe database access and migrations |
| **Database** | MySQL 8.0 | Persistent storage with utf8mb4 support |
| **Container** | Docker Compose | Multi-service orchestration (backend + nginx + mysql) |
| **Reverse Proxy** | Nginx | Static file serving and API proxying |
| **CDN** | Cloudflare | Edge caching, SSL termination, DDoS protection |
| **Validation** | Zod | Schema validation for API inputs |
| **Auth** | bcryptjs + Cookie | HttpOnly session cookies with bcrypt hashing |

## Project Structure

```
study-app/
├── client/                 # React SPA
│   ├── src/
│   │   ├── app/            # Components, pages, router
│   │   ├── layouts/        # Page layouts
│   │   ├── state/          # State management, session recorder
│   │   ├── i18n/           # Internationalization
│   │   └── main.jsx        # Entry point
│   └── vite.config.js
├── server/                 # Hono API server
│   ├── src/
│   │   ├── routes/         # API route handlers
│   │   ├── middleware/     # Auth, CORS, error handling
│   │   └── index.ts        # Entry point
│   └── prisma/
│       └── schema.prisma   # Database schema
├── infra/                  # Infrastructure configs
│   ├── docker-compose.yml  # Production orchestration
│   └── nginx/default.conf  # Nginx configuration
├── scripts/
│   └── deploy.sh           # One-command deployment
└── site.config.json        # Brand identity and i18n config
```

## Quick Start

### Prerequisites

- Node.js 20+
- Docker & Docker Compose

### Local Development

```bash
# 1. Start MySQL
cd infra/local-db
docker compose up -d

# 2. Setup server
cd server
cp .env.example .env
npm install
npx prisma migrate dev --name init
npm run dev

# 3. Setup client (new terminal)
cd client
npm install
npm run dev
```

Client: `http://localhost:5173` | API: `http://localhost:3002`

### Production Deploy

```bash
bash scripts/deploy.sh
```

Builds client, syncs to server via rsync, rebuilds Docker containers, and runs Prisma migrations.

## API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/user/register` | POST | Email/password registration |
| `/user/login` | POST | Email/password login |
| `/user/logout` | POST | Logout |
| `/user/me` | GET | Current user info |
| `/user/prefs` | GET/PUT | User preferences |
| `/user/github` | GET | GitHub OAuth URL |
| `/user/github/callback` | POST | GitHub OAuth callback |
| `/study-sessions` | POST | Record a Pomodoro session |
| `/study-sessions/stats` | GET | Cumulative statistics |
| `/study-sessions/daily` | GET | Daily stats for calendar |
| `/todos` | GET/POST | List or add todos |
| `/todos/:id` | PUT/DELETE | Toggle or delete a todo |
| `/music/playlist/:id?` | GET | Get playlist |
| `/music/song/:id/url` | GET | Get song URL |
| `/music/login` | POST | NetEase account login |

## License

MIT

---

<div align="center">

**If you find this project useful, give it a Star!**

</div>
