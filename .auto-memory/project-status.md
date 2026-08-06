---
name: project-status
description: 项目当前状态快照（覆盖写，≤30 行）— 当前批次、计划、决策、遗留问题
type: project
---
## 当前批次
- **M5-AUTH-RLS done ✅（2026-08-05，快车道回落，fix_rounds=2，复验轮三 12/12 PASS 签收）** — 真实认证（Auth.js v5 Credentials + JWT · 开放注册即建租户 · `src/middleware.ts` 全站鉴权 401 · fail-closed 限速 + 审计留痕）+ **RLS 地基**（`kol_app` 非特权角色 + 24 表 default-deny policy + BYPASSRLS 启动哨兵 + `DB_APP_ROLE_RUNTIME` 开关**默认关**）。租户来源仅「会话 / 显式 systemContext」两条路，**无隐式回落 dev**。签收报告 `docs/test-reports/M5-AUTH-RLS-signoff.md`（三轮，含 17,354 条语料对 Next 编译 regexp 的穷举核对）
- **本批两处真缺陷均由 evaluator 抓到**：I-1 middleware 豁免后缀正则作用于整条 path（`/api/x/abc.json` 可绕过闸门，靠 F004 fail-closed 兜住未泄漏）→ 已收窄到 public/ 静态目录 + `/api/` 一律不适用扩展名豁免双防线；I-2/I-4 我写的文档归因连续两轮失实（铁律 13 教训：**「与 X 一致」不等于核证过 X 的性质**）
- **F009 移出**（`BL-M51-TENANT-INJECTION`）：真库实测证伪 D-7 字面机制（官方范例式 $extends 毁 $transaction 原子性 / 不覆盖 raw SQL / 会话变量粘连接池）+ 引导悖论（切 kol_app 后无人能登录）。预裁决：双 client 白名单 + withTenant 包装器 + ALS。审计 `docs/specs/M5-AUTH-RLS-F009-preimpl-audit.md`
- M4.8 ✅ · M4.7 ✅ · M4.6 ✅ · M4.5 ✅ · M4 ✅ · M0→M3-B 全 ✅
- **异构模式首跑未成（如实记）**：codex 认证两难 ×2（个人 config 依赖自定义 provider ↔ 隔离 config 即断认证）· kimi 墙钟 ×1 + 本机 DNS 瞬断 ×1，零验收结论 → 回落隔离 subagent。registry/信封/适配器修复全部保留，网络稳定后可补异构复核轮

## 已上线
- `https://newkol.guangai.ai` 跑 **M5 + M5-DEPLOY-FIX @ `9f010a34bd7682edc19f0535797c00a2d822baf7`**（2026-08-06 部署，用户授权后由主实例代执行全部前置；回滚点 = M4.8 `c9236af1cc65cc64a0e7ecd50f15c86def0428d9`）
- 部署实况：R16 备份已做（`backups/kolmatrix-20260806T050827Z.dump`，pg_restore -l 182 对象自证）· `kol_app` 角色已建（f|f|t）· `.env` 三键已配 · compose 已同步且反向自证缺键即报错 · 公网复核认证面全过（health ok / login·signup 200 / admin 307→login / API 401 JSON / I-1 后缀绕过 401·307 不再 500 / 静态件 200）· **生产库 24 policy / 24 表启用，kol_app 未设变量 Project=0 行 vs 特权 6 行 → default-deny 在生产成立**
- **`DB_APP_ROLE_RUNTIME` 保持未设**（运行时仍特权连接，切换等 M5.1 注入落地）；启动哨兵持续告警「RLS 不生效」是刻意可见态
- ⚠️ image_tag 必须完整 40 位 SHA；compose 是 VPS 人工副本

## 需求池 / 待人类
- backlog 8 条，high：**BL-M51-TENANT-INJECTION**（M5.1，切非特权运行时的前提）· BL-COST-CAP · BL-AGENT-COST-CALIBRATE。medium：BL-AUTH-EMAIL-VERIFY（开放注册已知缺口）· BL-AGENT-ROUTINE · BL-E2E-CLEANUP-PIN · BL-VISUAL-DATA-ISOLATION。low：BL-TOOL-STREAM-OUTPUT
- **待人类**：M5 部署 + 上线后 L2 复测（真多用户会话 / 生产 RLS 跨租户手测 / `__auth-audit__` 占位租户不出现在用户可见面）· 工作树里 `.claude/dispatch/` 一批未提交的框架侧同步改动待你确认取舍
- proposed-learnings：2 条待确认（registry-less resolver 硬退 · codex 适配器默认 `--ignore-user-config`）

## 关键技术坑（M4→M5 精选）
- **跨环境形态差**本批连撞三次：psql 不认 Prisma `?schema=` · CI 空库无 dev 租户 · 「非空洞判据」靠别的测试填库才成立（真·空库复刻是唯一可靠自查法）
- **鉴权豁免的扩展名规则必须限定前缀**：作用于整条 path 时，末段动态段路由加 `.json` 即绕过 middleware，且既有测试一条都不会红
- 变异还原不得用 `git checkout`（会抹掉未提交的正身编辑）· fire-and-forget 落库须接 settle 等待 · 软引用表无 FK 不级联（本批再现，测试夹具漏清 opLog）
