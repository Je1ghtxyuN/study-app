<div align="right">
  <a title="English" href="/README.md">English</a>
</div>

<div align="center">

<img src="https://img.icons8.com/fluency/96/study.png" width="100" height="100" alt="Study Room Logo" />

# Study Room

一个沉浸式专注工作空间，集成番茄钟、环境场景、音乐和任务速记。

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)
![Hono](https://img.shields.io/badge/Hono-4-FF6B35?logo=hono&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma&logoColor=white)
![MySQL](https://img.shields.io/badge/MySQL-8.0-4479A1?logo=mysql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)
![Nginx](https://img.shields.io/badge/Nginx-Alpine-009639?logo=nginx&logoColor=white)
![Cloudflare](https://img.shields.io/badge/Cloudflare-CDN-F38020?logo=cloudflare&logoColor=white)

**线上体验**: [study.je1ght.top](https://study.je1ght.top)

</div>

---

## 功能特性

- **番茄钟** — 可配置的工作/休息时长，支持会话记录
- **环境场景** — 视频背景，营造沉浸式专注氛围
- **音乐播放器** — 通过网易云音乐集成播放列表
- **任务速记** — 快速记录待办事项，不打断专注流
- **统计分析** — 每日和累计学习时长统计，支持日历视图
- **多语言** — 支持英文、简体中文、繁体中文、日文
- **用户认证** — 邮箱密码和 GitHub OAuth 登录
- **响应式布局** — 自适应桌面端和移动端

## 技术栈

| 层级 | 技术 | 用途 |
|------|------|------|
| **前端** | React 19 + Vite 8 | SPA 应用，快速 HMR 和优化构建 |
| **路由** | react-router-dom 7 | 客户端路由 |
| **后端** | Hono | 轻量高性能 Web 框架 |
| **ORM** | Prisma 6 | 类型安全的数据库访问和迁移 |
| **数据库** | MySQL 8.0 | 持久化存储，支持 utf8mb4 |
| **容器** | Docker Compose | 多服务编排（后端 + nginx + mysql） |
| **反向代理** | Nginx | 静态文件服务和 API 代理 |
| **CDN** | Cloudflare | 边缘缓存、SSL 终止、DDoS 防护 |
| **校验** | Zod | API 输入的 Schema 验证 |
| **认证** | bcryptjs + Cookie | HttpOnly 会话 Cookie + bcrypt 哈希 |

## 项目结构

```
study-app/
├── client/                 # React SPA
│   ├── src/
│   │   ├── app/            # 组件、页面、路由
│   │   ├── layouts/        # 页面布局
│   │   ├── state/          # 状态管理、会话记录
│   │   ├── i18n/           # 国际化
│   │   └── main.jsx        # 入口文件
│   └── vite.config.js
├── server/                 # Hono API 服务
│   ├── src/
│   │   ├── routes/         # API 路由处理
│   │   ├── middleware/     # 认证、CORS、错误处理
│   │   └── index.ts        # 入口文件
│   └── prisma/
│       └── schema.prisma   # 数据库 Schema
├── infra/                  # 基础设施配置
│   ├── docker-compose.yml  # 生产环境编排
│   └── nginx/default.conf  # Nginx 配置
├── scripts/
│   └── deploy.sh           # 一键部署脚本
└── site.config.json        # 品牌标识和国际化配置
```

## 快速开始

### 环境要求

- Node.js 20+
- Docker & Docker Compose

### 本地开发

```bash
# 1. 启动 MySQL
cd infra/local-db
docker compose up -d

# 2. 配置服务端
cd server
cp .env.example .env
npm install
npx prisma migrate dev --name init
npm run dev

# 3. 配置客户端（新终端）
cd client
npm install
npm run dev
```

客户端: `http://localhost:5173` | API: `http://localhost:3002`

### 生产部署

```bash
bash scripts/deploy.sh
```

构建客户端、通过 rsync 同步至服务器、重建 Docker 容器并执行 Prisma 迁移。

## API 接口

| 接口 | 方法 | 说明 |
|------|------|------|
| `/health` | GET | 健康检查 |
| `/user/register` | POST | 邮箱密码注册 |
| `/user/login` | POST | 邮箱密码登录 |
| `/user/logout` | POST | 退出登录 |
| `/user/me` | GET | 当前用户信息 |
| `/user/prefs` | GET/PUT | 用户偏好设置 |
| `/user/github` | GET | GitHub OAuth 地址 |
| `/user/github/callback` | POST | GitHub OAuth 回调 |
| `/study-sessions` | POST | 记录番茄钟会话 |
| `/study-sessions/stats` | GET | 累计统计数据 |
| `/study-sessions/daily` | GET | 每日统计（日历） |
| `/todos` | GET/POST | 获取或添加待办 |
| `/todos/:id` | PUT/DELETE | 切换或删除待办 |
| `/music/playlist/:id?` | GET | 获取播放列表 |
| `/music/song/:id/url` | GET | 获取歌曲链接 |
| `/music/login` | POST | 网易云账号登录 |

## 开源许可

MIT

---

<div align="center">

**如果这个项目对你有帮助，请点个 Star!**

</div>
