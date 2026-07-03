#!/bin/sh
# start.sh — 带重试的容器启动脚本
# 等待数据库可达后再执行 db push + seed + 启动服务

set -e

DB_HOST=$(echo "$DATABASE_URL" | sed 's|.*@||' | cut -d: -f1)
DB_PORT=$(echo "$DATABASE_URL" | sed 's|.*@||' | sed 's|/.*||' | cut -d: -f2)
DB_PORT=${DB_PORT:-5432}

echo "[start] 等待数据库 $DB_HOST:$DB_PORT 可达..."

MAX_WAIT=60   # 最多等 60 秒
WAITED=0

until node -e "
  const net = require('net');
  const s = new net.Socket();
  s.setTimeout(3000);
  s.connect(${DB_PORT}, '${DB_HOST}', () => { process.exit(0); });
  s.on('error', () => process.exit(1));
  s.on('timeout', () => process.exit(1));
" 2>/dev/null; do
  if [ $WAITED -ge $MAX_WAIT ]; then
    echo "[start] 等待超时（${MAX_WAIT}s），数据库仍不可达，强制启动"
    break
  fi
  echo "[start] 数据库未就绪，3s 后重试... (${WAITED}/${MAX_WAIT}s)"
  sleep 3
  WAITED=$((WAITED + 3))
done

echo "[start] 执行初始化检查..."

# ── 初始化：只在全新容器（首次启动）时跑 ──────────────────────
# /app/.initialized 存在 → docker restart，直接跳过所有初始化
# /app/.initialized 不存在 → 全量重建后的新容器，执行完整初始化
if [ -f /app/.initialized ]; then
  echo "[start] 检测到已初始化标记，跳过 seed 和 db push（热重启）"
else
  echo "[start] 首次启动，执行完整初始化..."

  # Schema 同步（幂等，首次必跑）
  pnpm exec prisma db push --accept-data-loss 2>&1 || echo "[start] prisma db push 失败（可能已同步），继续..."

  # Seed 基础数据（管理员账号、全局配置、套餐等，幂等）
  node scripts/seed.js 2>&1 || echo "[start] seed.js 失败，继续..."

  # 话题数据：只在表为空时才种入
  TOPIC_COUNT=$(node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.topic.count().then(n => { console.log(n); p.\$disconnect(); }).catch(() => { console.log(0); p.\$disconnect(); });
" 2>/dev/null || echo "0")

  if [ "$TOPIC_COUNT" = "0" ]; then
    echo "[start] 话题表为空，开始种入话题数据..."
    node scripts/seed-topics.js 2>&1 || echo "[start] seed-topics.js 失败，继续..."
  else
    echo "[start] 话题表已有 ${TOPIC_COUNT} 条记录，跳过 seed-topics"
  fi

  # 写入初始化标记（容器重建后消失，restart 后保留）
  touch /app/.initialized
  echo "[start] 初始化完成，写入标记 /app/.initialized"
fi

echo "[start] 启动服务..."
exec node src/index.js
