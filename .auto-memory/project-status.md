---
name: project-status
description: 项目当前状态快照（覆盖写，≤30 行）— 当前批次、计划、决策、遗留问题
type: project
---
## 当前批次
- **M5.1-TENANT-INJECTION building（2026-08-06 立项，7 features，全 executor:generator）** — 把「地基就位、纵深未启用」的 RLS 真正接上运行时：三层 client（privilegedDb / 运行时 / ALS 感知代理）+ `withTenant` 事务内 `SET LOCAL` + ALS 租户作用域 + 引导白名单普查钉 + `DB_APP_ROLE_RUNTIME=1` 真开着的最小闭环。spec `docs/specs/M5.1-TENANT-INJECTION-spec.md`
- **本批两条新裁决（2026-08-06 用户实答）**：① 注入落点 = **ALS 感知代理**（206 处调用点零改写、85 个测试文件零改动、D-8 保住；只迁 15 处 `$transaction`）② **拆两批** —— M5.1 只到「机制成立有定论」，全站入口收口 + 生产切换 → `BL-M52-TENANT-COVERAGE`
- **立项实测推翻审计一处**：F009 审计（2026-08-04）写「引导查询点 = 3 个」已过期，实测 **≥7 处 / 4 文件**（M5 F006 登录留痕新增了引导写路径：`auth/audit.ts:137` 占位租户 upsert + `:138` 留痕 create，都发生在会话之前且写非当前租户的行）。白名单一律由普查产出
- **车道 = 本地异构**（签名意图 `e66dd7e5`，2026-08-06 消费）：Generator=`kimi`/local-cli · Evaluator=`codex`/local-cli · Planner=Coordinator。三角色 resolver 复核通过，family 互斥成立。⚠️ 上次异构首跑零验收结论（codex 认证两难 ×2 / kimi 墙钟 ×1 / DNS 瞬断 ×1）；再撞则回落隔离 subagent 并如实记，**不降 acceptance**
- M5-DEPLOY-FIX ✅ · M5-AUTH-RLS ✅（fix_rounds=2，复验轮三 12/12 PASS）· M4.8 ✅ · M4.7 ✅ · M4.6 ✅ · M4.5 ✅ · M4 ✅ · M0→M3-B 全 ✅

## 已上线
- `https://newkol.guangai.ai` 跑 **M5 + M5-DEPLOY-FIX @ `9f010a34bd7682edc19f0535797c00a2d822baf7`**（2026-08-06 部署，用户授权后由主实例代执行全部前置；回滚点 = M4.8 `c9236af1cc65cc64a0e7ecd50f15c86def0428d9`）。2026-08-06 复核 `health=200 {"ok":true}`
- 部署实况：R16 备份 `backups/kolmatrix-20260806T050827Z.dump`（pg_restore -l 182 对象自证）· `kol_app` 角色已建（f|f|t）· `.env` 三键已配 · compose 已同步且反向自证缺键即报错 · 公网复核认证面全过 · **生产库 24 policy / 24 表启用，kol_app 未设变量 Project=0 行 vs 特权 6 行 → default-deny 在生产成立**
- **`DB_APP_ROLE_RUNTIME` 保持未设**（运行时仍特权连接）；启动哨兵持续告警「RLS 不生效」是刻意可见态。**本批不改这个默认值**，切换在 M5.2 且永远是人类闸门
- ⚠️ image_tag 必须完整 40 位 SHA；compose 是 VPS 人工副本

## 需求池 / 待人类
- backlog 8 条，high：**BL-M52-TENANT-COVERAGE**（M5.1 的另一半：入口全覆盖 + 全量 e2e + 生产切换）· BL-COST-CAP · BL-AGENT-COST-CALIBRATE。medium：BL-AUTH-EMAIL-VERIFY · BL-AGENT-ROUTINE · BL-E2E-CLEANUP-PIN · BL-VISUAL-DATA-ISOLATION。low：BL-TOOL-STREAM-OUTPUT
- **待人类 L2 手测**（M5 上线后未做）：注册一个真账号走通登录→对话 · 真多用户会话 · `__auth-audit__` 占位租户不出现在用户可见面 · M4.7 原始故障场景复测
- proposed-learnings：2 条（registry-less resolver 硬退 · codex 适配器默认 `--ignore-user-config`）**2026-08-06 用户裁决继续挂起**，不写入 framework/；harness-fit P0-3/P1/P2 长期挂起同前

## 关键技术坑（M4→M5 精选）
- **跨环境形态差**：psql 不认 Prisma `?schema=` · CI 空库无 dev 租户 ·「非空洞判据」靠别的测试填库才成立（真·空库复刻是唯一可靠自查法）
- **鉴权豁免的扩展名规则必须限定前缀**：作用于整条 path 时，末段动态段路由加 `.json` 即绕过 middleware，且既有测试一条都不会红
- 变异还原不得用 `git checkout`（会抹掉未提交的正身编辑）· fire-and-forget 落库须接 settle 等待 · 软引用表无 FK 不级联 · `git grep` 类断言只搜已跟踪文件，新文件未 commit 时恒空绿
