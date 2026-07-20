#!/bin/sh
# GO-LIVE F002 — 一次性迁移 + seed（tools 镜像入口，容器网络内跑）
#
# 幂等：
#  - prisma migrate deploy 只应用未应用的迁移（含 D3 CREATE EXTENSION vector），每次 deploy 安全重跑。
#  - seed 仅当 Kol 表为空（首次 go-live）时灌；已有数据则跳过——省去 re-upsert / re-embed。
#    （import-kol-csv 自身亦幂等 upsert，此处 count 守卫是快路径，双保险。）
# env（DATABASE_URL / AIGCGATEWAY_*）由 compose 注入；不依赖 .env 文件。
set -e

echo "[migrate-seed] 1/2 prisma migrate deploy（建表 + pgvector 扩展）"
npx prisma migrate deploy

echo "[migrate-seed] 2/2 seed 幂等检查（Kol 表计数）"
KOL_COUNT=$(node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.kol.count().then(c=>{process.stdout.write(String(c));return p.\$disconnect()}).catch(e=>{console.error(e.message);process.exit(3)})")

if [ "$KOL_COUNT" = "0" ]; then
  echo "[migrate-seed] Kol 表空 → 首次 seed（~2500 KOL + bge-m3 embedding，一次性）"
  node --import tsx scripts/seed/import-kol-csv.ts
  echo "[migrate-seed] ✅ 迁移 + 首次 seed 完成"
else
  echo "[migrate-seed] Kol 已有 ${KOL_COUNT} 条 → 跳过 seed（幂等，不重复灌）"
  echo "[migrate-seed] ✅ 迁移完成（seed 跳过）"
fi
