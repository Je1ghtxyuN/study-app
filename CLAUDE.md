# CLAUDE.md

## Project Overview

Study App — an immersive focus workspace with Pomodoro timer, ambient scenes, music, and task capture. Standalone SPA + API, deployed at `study.je1ght.top`.

## Tech Stack

- **Client:** React 19 + Vite 8 + react-router-dom 7
- **Server:** Hono + Prisma ORM + MySQL 8.0
- **Infra:** Docker Compose (backend + nginx + mysql), Cloudflare CDN

## Repository Structure

```
study-app/
├── client/          ← React SPA
├── server/          ← Hono API (port 3002)
├── infra/           ← Docker Compose + nginx
├── scripts/         ← deploy.sh
├── assets/          ← videos, music, sound effects, locales
└── site.config.json ← brand identity + i18n config
```

## Commands

### Client (`client/`)
```
npm run dev          # Vite dev server (port 5173)
npm run build        # Production build
npm run lint         # ESLint
npm run preview      # Preview production build
```

### Server (`server/`)
```
npm run dev          # Hono with --watch (port 3002)
npm start            # Hono server (port 3002)
npm run prisma:generate    # prisma generate
npm run prisma:migrate:dev # prisma migrate dev
npm run prisma:studio      # prisma studio GUI
```

### Deploy
```
bash scripts/deploy.sh     # Build + sync + Docker rebuild on server
```

## API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/health` | GET | Health check |
| `/user/register` | POST | Email/password registration |
| `/user/login` | POST | Email/password login |
| `/user/logout` | POST | Logout |
| `/user/me` | GET | Current user |
| `/user/prefs` | GET/PUT | User preferences |
| `/user/github` | GET | GitHub OAuth URL |
| `/user/github/callback` | POST | GitHub OAuth callback |
| `/study-sessions` | POST | Record Pomodoro |
| `/study-sessions/stats` | GET | Statistics |
| `/study-sessions/daily` | GET | Daily stats for calendar |
| `/todos` | GET/POST | List/add todos |
| `/todos/:id` | PUT/DELETE | Toggle/delete todo |
| `/music/playlist/:id?` | GET | Get playlist |
| `/music/song/:id/url` | GET | Get song URL |
| `/music/login` | POST | NetEase account login |

## Database

MySQL via Prisma. Models: `Session`, `StudyUser`, `StudySession`, `TodoItem`.

## Deployment

- Server: `je1ght-server` via SSH
- Docker dir: `~/docker/study-app/`
- Domain: `study.je1ght.top` (Cloudflare proxied)
- Backend port: 3002 (internal)
- Nginx: port 8080 (mapped to 80 in container, Cloudflare routes HTTPS to this)

## Conventions

- ES modules throughout (`"type": "module"`)
- Cookie-based auth (`study_session` HttpOnly cookie)
- CORS: allows `https://study.je1ght.top` and `http://localhost:5173`
- i18n: 4 locales (en, zh-CN, zh-TW, ja) via localStorage key `site-locale`
