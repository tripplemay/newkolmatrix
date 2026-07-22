#!/bin/sh
# GO-LIVE F002 — 一次性迁移 + seed（tools 镜像入口，容器网络内跑）
#
# 幂等：
#  - prisma migrate deploy 只应用未应用的迁移（含 D3 CREATE EXTENSION vector），每次 deploy 安全重跑。
#  - seed 仅当 Kol 表为空（首次 go-live）时灌；已有数据则跳过——省去 re-upsert / re-embed。
#    （import-kol-csv 自身亦幂等 upsert，此处 count 守卫是快路径，双保险。）
# env（DATABASE_URL / AIGCGATEWAY_*）由 compose 注入；不依赖 .env 文件。
set -e

echo "[migrate-seed] 1/3 prisma migrate deploy（建表 + pgvector 扩展）"
npx prisma migrate deploy

echo "[migrate-seed] 2/3 seed 幂等检查（Kol 表计数）"
KOL_COUNT=$(node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.kol.count().then(c=>{process.stdout.write(String(c));return p.\$disconnect()}).catch(e=>{console.error(e.message);process.exit(3)})")

if [ "$KOL_COUNT" = "0" ]; then
  echo "[migrate-seed] Kol 表空 → 首次 seed（~2500 KOL + bge-m3 embedding，一次性）"
  node --import tsx scripts/seed/import-kol-csv.ts
else
  echo "[migrate-seed] Kol 已有 ${KOL_COUNT} 条 → 跳过 seed（幂等，不重复灌）"
fi

# M1-B signoff S7（M1-A S2 顺延兑现）：详情页 RSC 直读 Project 行，无此 seed 则
# prod 详情页全 D2 空态。canonical-projects 按 slug upsert + 自建 dev tenant，
# 完全幂等且不打网关（无 embedding），每次 deploy 无条件重跑安全。
echo "[migrate-seed] 3/3 canonical 项目 seed（幂等 upsert）"
node --import tsx scripts/seed/canonical-projects.ts

echo "[migrate-seed] ✅ 迁移 + seed 完成"
