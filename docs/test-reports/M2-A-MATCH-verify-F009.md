# M2-A-MATCH F009 验收记录 — 收尾：SW-R1 探针退役 + OBS-1 image part 迁移 + 文档翻牌

- **署名：** Andy/evaluator-subagent（隔离上下文，fan-out 分片：仅 F009）
- **日期：** 2026-07-22（首轮 verifying，fix_rounds=0）
- **被验对象：** commit `3d93f72`（feat(M2-A-MATCH-F009)），基于磁盘实物 + 命令输出 + dev DB 实测，不采信任何叙述
- **口径：** features.json F009 acceptance 逐项；L2 授权范围 = spec §4（仅 embedText 与可选真对话，vision 不在其列）；端口纪律（:3000 归 READINESS，本分片不起 server）

## 结论：PASS（8/8 L1 项全过；1 项 [L2] 真 vision 按 spec 口径留授权，非缺陷）

---

## 逐条判定

### 1. SW-R1：删 `scripts/test/f007-browser-check.mjs` + package.json `f007:browser` 入口 — PASS

- `ls scripts/test/` 无 `f007-browser-check.mjs`；commit 3d93f72 stat 显示该文件 85 行整删。
- `grep -n "f007" package.json` → 零命中（exit 1），`f007:browser` script 入口已除（commit stat：package.json -1 行）。

### 2. 替代探针与 f010 覆盖保持 — PASS

- `scripts/test/m1c-readiness-f007-l1-substitute.mjs` 在盘，头部 :3-7 已加「SW-R1 退役注记（M2-A F009，U3 裁决）」——明示原探针已删、本文件为 f007 守护面现行唯一 L1 探针，原陈旧背景保留为历史依据。
- `f010:e2e` script 保持（package.json:28）+ `scripts/test/f010-e2e-check.mjs` 在盘。
- 探针实跑归 READINESS 分片（端口纪律），本分片验保持性（实物存在 + 入口存在），不重复跑。

### 3. 被删路径 needle 全仓 grep（docs 就绪回归引用处翻牌注记）— PASS

- 全仓 grep `f007-browser-check|f007:browser`（排 node_modules/.next/.git）：**零代码残留**。余留命中逐类核：
  - `scripts/test/m1c-readiness-f007-l1-substitute.mjs`:3-7 = 本 acceptance 要求的翻牌注记本体（注释，非引用）；
  - `docs/test-reports/M1-C-*/M1-D-*/AGENT-FOUNDATION-*` = 历史验收报告审计记录，正确地未被篡改；
  - `features.json` / `docs/specs/M2-A-MATCH-spec.md` = 本批工作项描述自身。
- 现行就绪回归口径已翻牌：spec §5「（f007 原样探针已退役）」；M2-A READINESS 分片报告同口径并实测两删除物不存在。

### 4. OBS-1：parse.ts image part `type:'image'` → `type:'file'` 迁移 — PASS

- `src/lib/knowledge/parse.ts:88-106` `buildImageUserContent`（独立导出）：FilePart `{type:'file', data, mediaType}`，mediaType 必填、缺省兜底顶级段 `'image'`；`defaultLlmCaller` image 分支 :118 经其构造 messages content。
- src 全 grep `type:'image'` 变体：唯一命中 = parse.ts:85 迁移说明注释，运行代码零残留。

### 5. mock 网关单测回归 + 断言弃用告警消除 — PASS

- `tests/unit/knowledge-parse-output.test.ts:72-100` 新增 3 case：FilePart 形状断言 / **显式断言构造产物不含任何 `type:'image'` 弃用 part 且旧 ImagePart 的 `image` 字段零残留**（告警根因消除）/ mediaType 兜底。实跑 9/9 passed（221ms）。
- 全量 `npm run test:unit`：**28 文件 307/307 passed**（独立复跑，与 commit 声称一致）。
- 加测 `tests/integration/knowledge-parse.test.ts`（mock LLM + 真库夹具租户）：9/9 passed——解析管道无回归；夹具 afterAll 自清（:88-93）。
- **[L2] 真 vision 调用未执行**：spec §4 授权范围仅 embedText 与可选真对话，vision 不在授权列；acceptance 本身写明「真 vision 属 L2 留验收授权」，合规非缺陷。

### 6. 文档翻牌：architecture.md — PASS（逐段 diff 核到 + 文档新鲜度 clause 逐条 grep 实物反证非虚标）

commit 3d93f72 对 docs/dev/architecture.md 的 diff 覆盖 acceptance 全部列举段，且每条翻牌声明均与代码实物吻合：

| 翻牌声明 | 实物证据 |
|---|---|
| §5.2 三表 ✅ 已实装（tenantId+publicId / reasons zod / @@unique 幂等键） | schema.prisma:273 MatchPlan / :299 PlanKol / :321 MatchCandidate |
| §5.3 ① →reach 真判定校准（hasApprovedMatchPlan / MATCH_PLAN_NOT_APPROVED） | env-guards.ts:28,:62,:125-127；→delivery/insight 保持 DEPENDENCY_NOT_IMPLEMENTED（:130,:133）与文档一致 |
| §5.3 ⑦ MatchPlan.status / ⑧ MatchCandidate.verdict 状态机新增（D20 测试已配） | tests/integration/match-approve.test.ts + match-services.test.ts 在盘（细项归 F003/F004 分片） |
| §5.4 + §7.3 matchScore ✅（MATCH_WEIGHTS{similarity:0.7, audience:0.3} 导出） | domain/match-score.ts:20-25 逐字吻合 |
| §8.5 + §15 ADR-28 ✅ 兑现（type 优先/工具名回退 + registerCanvasRenderer） | canvas-registry.tsx:24 register API（重名抛错）/:49 type 优先路由 |
| :1036 uiSyntax 已注入 | registry.ts:61-63「你的产出形态：${uiSyntax}」 |
| :1094 match 四件 + 目标态清单划线 | registry.ts:100 `['search_kols','get_kol_detail','match_plan','evaluate_creator']` |
| §8.10 注册表化 + nightly-screen ✅ + **health-scan 频率 as-built 注记（M1-C S7 顺手校准：实装 `0 2 * * *` 每夜非每小时）** | scheduler.ts:22 HEALTH_SCAN_CRON='0 2 * * *' / :25 NIGHTLY_SCREEN_CRON='30 2 * * *' / :39-54 ROUTINES 双例程 |
| §14 M2-A 行 ✅ 已交付 + M2-B 计划行拆分 | diff :1805-1809 |

### 7. agent-architecture.md 工具/canvas 段同步 — PASS

- 柱一 native 工具 as-built 校准（+compute_health/match_plan/evaluate_creator，match_plan 输出携带 type:'match_plan'）；柱四 canvas ADR-28 段（type 优先/回退键/受控 register/MatchPlanCard）；§2.1 persona 段（systemPrompt 三段含 uiSyntax + match tools 四件）。与上表同一批实物互证。

### 8. lint + tsc + test:unit 绿 — PASS

- `npm run lint` → `✔ No ESLint warnings or errors`（0 error 0 warning，无 lint 矩阵触发）。
- `npx prisma generate`（testing-env-patterns §3 前置）→ `npx tsc --noEmit` exit 0。
- `npm run test:unit` → 307/307 passed。

---

## D-H 清态复核（验收退出态）

验收后实测（prisma count）：`{"MatchPlan":0,"PlanKol":0,"MatchCandidate":0,"PendingAction":0,"OperationLog":0}`——Match 三表 / PendingAction / OperationLog 全零行，清态保持；集成测试夹具（Material/GameKnowledge/Game/Tenant）由测试 afterAll 自清。

## 备注

- 本分片零产品代码改动；唯一新增产物 = 本报告。
- [L2] 真 vision 端到端（真图 → qwen3.5-flash）未执行，待授权（spec §4 授权范围不含 vision；下一次授权 L2 vision 时可用 `parseMaterial` + 真图素材直验）。
