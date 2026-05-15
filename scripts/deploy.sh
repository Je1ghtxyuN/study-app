#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVER="je1ght-server"
SERVER_APP="/home/je1ght/docker/study-app"

echo "========================================="
echo " Deploy Study App to study.je1ght.top"
echo "========================================="

# --- Local build ---

echo ""
echo "[1/5] Building client..."
cd "$REPO_ROOT/client"
npm run build --silent 2>&1 | tail -1

echo "[2/5] Syncing client build to server..."
rsync -avz --delete \
  "$REPO_ROOT/client/dist/" \
  "$SERVER:$SERVER_APP/client-dist/" 2>&1 | tail -1

echo "[3/5] Syncing server source to server..."
rsync -avz --delete \
  --exclude='node_modules' \
  --exclude='.env' \
  "$REPO_ROOT/server/" \
  "$SERVER:$SERVER_APP/server/" 2>&1 | tail -1

echo "[4/5] Syncing infra configs..."
rsync -avz "$REPO_ROOT/infra/docker-compose.yml" "$SERVER:$SERVER_APP/" 2>&1 | tail -1
rsync -avz "$REPO_ROOT/infra/nginx/default.conf" "$SERVER:$SERVER_APP/nginx/" 2>&1 | tail -1

echo "[5/5] Installing deps & rebuilding Docker..."
ssh "$SERVER" "cd $SERVER_APP/server && npm ci --omit=dev --silent 2>&1 | tail -1"
ssh "$SERVER" "cd $SERVER_APP && docker compose build study-backend 2>&1 | tail -3 && docker compose down 2>&1 | tail -1 && docker compose up -d 2>&1 | tail -1"
ssh "$SERVER" "docker exec study-backend npx prisma migrate deploy 2>&1 | tail -1"

echo ""
echo "========================================="
echo " Deploy complete!"
echo " https://study.je1ght.top"
echo "========================================="