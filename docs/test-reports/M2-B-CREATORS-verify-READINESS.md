# M2-B-CREATORS 首轮验收 — READINESS（批次级就绪回归）

- **署名：** Andy/evaluator-subagent（隔离 fresh context）
- **日期：** 2026-07-23
- **口径：** spec §5 就绪回归 = lint + tsc + test:unit（全量含集成测试）+ test:visual 全绿；
  三条 p2 探针（p2:f001/f002/f004）+ f008:browser + f010:e2e + m1c-readiness-f007-l1-substitute 无回归
- **结论：PARTIAL** —— 8 门中 7 门全绿；`test:unit` 门在真凭据本地环境高频红
  （`tests/integration/match-verdict.test.ts` 断言 1 缺 lazy 防触发守卫 → 集成测打真网关，
  P7 边界违反 + 隔离复跑 3 次 2 红）。产品代码无回归，修复为测试文件 2 行级。

---

## 1. 环境与基线态核查（前置）

| 项 | 实测 | 判定 |
|---|---|---|
| Node | v25.7.0（仓无 `.nvmrc`；CI=Node 20。vitest 固定 node 环境无 jsdom，testing-env-patterns §4 localStorage 坑不适用） | ✓ |
| `prisma generate` 前置 | 已跑（testing-env-patterns §3） | ✓ |
| :3000 | `lsof -ti :3000` 空（重生序 §4.5 纪律；本轮不重生基线，仅消费） | ✓ |
| Kol 库 | dev 租户 2526 行 = 2524 user_upload 归一底座 + 2 视觉夹具（`vk-visual-full-0001` dataSource=crawl / `vk-visual-null-0002` user_upload），publicId/canonicalHandle 与 `scripts/seed/visual-kols.ts:17-18` 一致 | ✓ |
| Match 三表 / PendingAction / OperationLog | 起跑时 0/0/0/0/0（D-H 清态） | ✓ |
| 并行 fan-out 干扰 | 起跑核查时目击 `test-tenant-m2b-verdict-42261`（F006 并行验收者夹具租户）在两次查询间被清——确认为其收尾清理；我的门类起跑时 testTenants=[]，无残留干扰 | ✓（记录在案） |

## 2. 逐门判定

| # | 门 | 结果 | 证据 |
|---|---|---|---|
| 1 | `npm run lint` | **PASS** | `✔ No ESLint warnings or errors`（0 errors / 0 warnings，§15 矩阵无触发） |
| 2 | `npx tsc --noEmit` | **PASS** | exit 0，零输出 |
| 3 | `npm run test:unit`（全量真凭据） | **FAIL** | 34 文件 355/356：`tests/integration/match-verdict.test.ts` 断言 1「pending → kept…读侧联动」5000ms 超时（实测 5007ms）。根因 §3。隔离复跑 3 次：1 绿（3.52s）/ 2 红（5.06s、5.07s）——非一次性冷跑抖动 |
| 3b | `test:unit`（伪网关凭据 = CI 等价对照） | PASS | `AIGCGATEWAY_BASE_URL=http://127.0.0.1:9 AIGCGATEWAY_API_KEY=probe` → 34 文件 356/356 绿，tests 6.07s——证明红源唯一 = 该测试对真网关的网络耦合 |
| 4 | `npm run build` | **PASS** | exit 0；路由清单正常产出（`/api/match/candidates/[id]/verdict` 等 ƒ 动态在列） |
| 5 | `npm run test:visual`（基线态：Match 表零行 + 2 夹具 + 伪网关凭据） | **PASS** | 13/13 绿 24.7s（agent-canvas / creator-drawer 双状态 / today / 六页工作台含 creators）；lazy 降级 warn ×5 = 伪凭据生效、CI 基线态语义正确（D2 静默降级路径活） |
| 6 | `npm run p2:f001`（抽屉关闭路径） | **PASS** | 12 passed / 0 failed（桌面 + 移动 390×844 双视口，无 page error） |
| 7 | `npm run p2:f002`（深色持久化） | **PASS** | 14 passed / 0 failed（含 F-mut 变异活性证明） |
| 8 | `npm run p2:f004`（HandoffPanel） | **PASS** | 15 passed / 0 failed（生产/夹具容器 class 逐字相同） |
| 9 | `npm run f008:browser` | **PASS** | 12 / 0（重定向链 / IA 契约句 / 五环节导轨 / Copilot 人格切换 / console 0 error） |
| 10 | `npm run f010:e2e`【L2 真对话，已授权最小用量】 | **PASS** | 6 / 0：match 环节真流式对话 → search_kols → 画布 20 张 KOL 候选卡；reach 人格切换；handoff 可视化；console 0 error |
| 11 | `node scripts/test/m1c-readiness-f007-l1-substitute.mjs` | **PASS** | 10 / 0（CopilotPanel 常驻 / 专家头 route→人格 / demo handoff 经 /api/handoffs 在场 / console 0 error） |

## 3. 红门根因（实证链）

`tests/integration/match-verdict.test.ts`（F006 D20 交付物）断言 1 调用
`loadMatchSurfaceData(projectId, 'match')`，而 beforeAll 只跑了 `generateCandidates`（:60）
**未建组**——夹具项目 `matchPlan.count === 0`，命中 `surface-data.ts:47-49` 的 P2 lazy 路径：
`generateCandidates(projectId)` **无 deps 注入** → `generate-candidates.ts:119`
`deps.embed ?? embedText` 回落**真网关 embed**（vitest.config 已 `loadEnvFile('.env')`，
本地持真凭据）。真网络延迟 ~3s、尾部 >5s → vitest 默认 5000ms testTimeout 高频压线。

三道交叉实证：

1. **真凭据隔离复跑 3 次 = 1 绿 2 红**（绿的那次 tests 3.13s，含一次成功的真网关调用）；
2. **伪网关（fail-fast ECONNREFUSED）= 5/5 绿 410ms**——lazy 走 D2 静默降级，无网络等待；
3. **同类先例已修而本文件漏改**：F007 的 `score-upgrade.test.ts:128-131` 有同款防触发守卫
   （「建组使 plans>0：loadMatchSurfaceData 的 P2 lazy 不触发（否则会用真网关重刷 mock 分）」），
   `match-verdict.test.ts` 是同一 hazard 的漏网点。

**定性：** 测试文件缺陷，非产品缺陷（lazy 语义 = P2/D2 设计正确；verdict 服务层 5 断言在网络快时全过）。
但影响面是硬的：(a) spec §3 **P7「单测/集成测不打真服务不打网关」被违反**——每次本地全量
`test:unit` 都真实打网关（bge-m3 embed，一次性花费极小但持续累积且不该发生）；(b) 就绪门
「test:unit 全绿」在真凭据本地环境（vitest.config 注释明确支持的本地集成测跑法）**约 2/3 概率红**；
(c) CI 无凭据 fail-fast 恒绿 → 环境不对称掩盖，只在带真凭据的机器上暴露。

**修复方向（Generator）：** 对照 `score-upgrade.test.ts:128-131`，在 beforeAll 的
`generateCandidates` 后补 `await buildMatchPlans(projectId)`（2 行级）。仅加 testTimeout
余量是治症不治因——真网关调用与 P7 违反仍在。

**与 F006 fan-out 结论的关系：** F006 验收者曾目击一次同款超时，记为「冷跑 flake、复跑均绿」
的不阻断观察。本轮复跑数据（隔离 3 跑 2 红）推翻「复跑均绿」；根因为确定性网络耦合而非
冷启动抖动。F006 功能面 acceptance（写入口/幂等/改判/zod/404/UI/原型清单同步）维持其
验收者的 PASS 判定不变；本 PARTIAL 仅指向其 D20 测试交付物的这一处缺陷。
features.json F006 已按规则改回 `pending` 以承载该修复（铁律 10 归属）。

## 4. L2 用量记录（最小用量，遵授权口径）

- f010:e2e：1 次真流式对话（chat=deepseek-v3 + search_kols 工具内 embed）——授权内最小用量；
- 附带（非计划内）：match-verdict 测试 lazy 误触真网关 embed ×~4（全量 1 + 隔离复跑 3，
  其中 1 次成功计费、余为超时/成功不定）+ f008/f010 浏览 match 页触发 lazy 真生成的
  embed 数次（buildMatchPlans 纯规则无 chat）。均为 bge-m3 单短文本量级；
- **apify-kol 真拉取 / TikHub：本 READINESS 门未执行**（归 F001/F003 验收轨；TikHub 零调用
  零投喂 P1 铁律全程未触碰，/admin/seeds 未碰）。

## 5. 收尾清理（D-H 终态 = 起始基线态）

- 杀 :3000（`kill` 后 `lsof` 确认 port-free）；
- 清运行产物：PlanKol 60 / MatchCandidate 40 / MatchPlan 6（f008/f010 真凭据浏览触发的
  lazy 真生成落库）+ demo-handoff 1 行（f010 seed，幂等复用的 2026-07-20 行，按验收指令清除）
  + PendingAction 0 / OperationLog 0；
- 终态复核：Match 三表 0/0/0、PendingAction 0、OperationLog 0、handoff 0、测试租户 0、
  Kol 2526（2 视觉夹具在场）——视觉夹具与 Kol 库按 D-H 边界**未清**；
- 本轮临时 DB 核查脚本（scripts/test/m2b-readiness-db-*.ts ×4）已删除，工作树无本轮残留。

## 6. 复现步骤（红门）

```bash
# 1. 真凭据（.env 含真 AIGCGATEWAY_API_KEY）下隔离复跑——约 2/3 概率断言 1 超时红：
npx vitest run tests/integration/match-verdict.test.ts
# 2. 伪网关对照——恒绿 410ms，证明红源 = 真网关网络耦合：
AIGCGATEWAY_BASE_URL=http://127.0.0.1:9 AIGCGATEWAY_API_KEY=probe \
  npx vitest run tests/integration/match-verdict.test.ts
# 3. 根因阅读：tests/integration/match-verdict.test.ts:60（无建组）
#    vs tests/integration/score-upgrade.test.ts:128-131（防触发守卫先例）
#    + src/lib/match/surface-data.ts:47-49（lazy）+ generate-candidates.ts:119（embed 回落）
```
