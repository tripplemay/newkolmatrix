# CICD-VPS F001 — KOLMatrix (newkolmatrix) 生产镜像
# Next.js 15 standalone 多阶段构建。node 20-alpine 对齐 VPS(Node 20.20)。
# syntax=docker/dockerfile:1

# ---- deps: 仅装依赖（利用层缓存）----
FROM node:20-alpine AS deps
WORKDIR /app
# .npmrc 含 legacy-peer-deps=true（React 19 RC peer 冲突）
COPY package.json package-lock.json .npmrc ./
# prisma schema 必须先于 npm ci —— postinstall 会跑 `prisma generate`，需读 prisma/schema.prisma（F002）
COPY prisma ./prisma
RUN npm ci

# ---- build: 编译 standalone 产物 ----
FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- tools: 一次性 migrate + seed（含 prisma CLI + migrations + seed 脚本 + CSV + tsx）----
# GO-LIVE F002 — app runner 保持最小（不含这些）；迁移/seed 由本目标的 one-shot 容器承担（D-GL3）。
# 复用 build 阶段：已有全量 source（prisma/ scripts/ src/）+ node_modules（prisma CLI + tsx devDeps）。
FROM build AS tools
WORKDIR /app
RUN chmod +x scripts/deploy/migrate-seed.sh
# env（DATABASE_URL / AIGCGATEWAY_*）由 compose migrate 服务注入。默认跑迁移+条件 seed。
CMD ["sh", "scripts/deploy/migrate-seed.sh"]

# ---- runner: 最小运行镜像（默认目标）----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# 非 root 运行
RUN addgroup -g 1001 -S nodejs && adduser -u 1001 -S nextjs -G nodejs
# standalone server + 静态资源（standalone 不含 .next/static 与 public，需单独 copy）
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
