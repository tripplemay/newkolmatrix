# M2-B-CREATORS F006 验收记录 — MatchCandidate 裁定写入口（U3 布局变更）

- **署名：** Andy/evaluator-subagent（隔离上下文，fresh context）
- **日期：** 2026-07-23
- **阶段：** verifying（首轮）
- **结论：PASS**（acceptance 逐项全过；1 条测试稳定性观察 + 1 条 F008 域文档新鲜度观察，均不阻断）

## 验收方式

评估基于实物：代码逐行核对（route/service/UI/原型/清单）、本机 L1 实测（lint/tsc/unit/集成测打真库）、
路由层直调探针（不起 :3000，遵端口纪律）、CI job 级结论核查（gh api）。未采信 commit message /
session_notes 任何叙述。L2（apify-kol 真拉取 / embedding 真灌）不涉本 feature——F006 全链路
本地可验，未执行 L2。TikHub 零调用（P1 遵守）。

## 逐条 acceptance 判定

| # | acceptance 条目 | 判定 | 证据 |
|---|---|---|---|
| 1 | `POST /api/match/candidates/[id]/verdict {verdict:'kept'\|'dropped'}` | PASS | `src/app/api/match/candidates/[id]/verdict/route.ts`（zod bodySchema `z.enum(['kept','dropped'])`，nodejs runtime，薄封装 `lib/match/verdict.ts` 服务层） |
| 2 | internal：无确认框（D27/:1352 双边铁律）零 PendingAction | PASS | route/service 全文无 PendingAction 写入（grep 0 命中）；UI `VerdictButtons` 点击直发无弹窗；探针实测 paBefore=0→paAfter=0、olBefore=0→olAfter=0（7 次调用后） |
| 3 | 幂等同值重放 200 | PASS | 路由直调探针：kept 重放 `{status:200, changed:false}`；服务层集成测断言 3：changed=false 且 updatedAt 不变（不写库） |
| 4 | pending→kept/dropped + kept↔dropped 改判合法 | PASS | 探针：pending→kept 200 changed=true → kept→dropped 200 changed=true；集成测断言 1/2 同证；DB 终值 dropped 读回确认 |
| 5 | 非法值 zod 拒 + 不存在 404 | PASS | 探针：`{verdict:'maybe'}` → 400「verdict 必须为 kept 或 dropped」；坏 JSON body → 400（不炸 500）；nonexistent id → 404「候选不存在」；publicId 双口径 200（`verdict.ts` OR [id, publicId] 查询） |
| 6 | 【D20】人工流转变异测试（改判/幂等/P4 刷新不回退回归） | PASS | `tests/integration/match-verdict.test.ts` 6 断言设计（写入口失效/终态锁死/重放重写/静默吞/P4 回退/读侧离表 各杀一类变异）；本机打真库 5/5 绿（pid 隔离夹具租户）；断言 5 = 裁定后 `generateCandidates` 再跑 verdict 仍 dropped（M2-A upsert 保护跨批回归）；CI（8fd275f）Unit+integration job success |
| 7 | match/index.tsx 待裁定表行内「保留/剔除」双钮（审阅旁 ghost；toast+router.refresh 行离表） | PASS | `src/components/envs/match/index.tsx:194-247`（VerdictButtons：ghost + MdCheck/MdClose，置于 ReviewButton 之后 :323-327）；toast 文案与原型 L998-999 逐字一致；`buildFuzzyColumns(() => router.refresh())` 工厂注入 :353-356；读侧 `surface-data.ts:88` `verdict:'pending'` 过滤 → 集成测断言 6 实证裁定后 `loadMatchSurfaceData` 离表 |
| 8 | 布局变更同步：原型 FUZZY 行加 affordance | PASS | `docs/product/interaction-prototype-v2.html:780`（data-keep/data-drop 双钮入 FUZZY 行模板）+ :998-999（toast 绑定，文案与实现一致） |
| 9 | ARCH-M05-ui-inventory.md V5 登记（22→+2） | PASS | `docs/specs/ARCH-M05-ui-inventory.md:68`「V5 … 24 元素（M2-B F006 布局变更 +2）」+ :69 两钮逐一登记（含 verdict 语义与离表说明） |
| 10 | project-match.png 对账（CI 空态无按钮不变，本地对账） | PASS | F006 commit 8fd275f 零基线文件变更；`project-match-{linux,darwin}.png` 最后触碰均在 M2-A（5ed8dfc/46c0359）——空态无候选行即无按钮，零漂移符合预期；视觉 spec `workbench.spec.ts:38-52` 双空态文案硬断言仍在；CI Visual regression job success @ 8fd275f/7321292/e95a7ff（本地全量视觉复跑归 READINESS，不重复） |
| 11 | K3 采纳率数据面注记 | PASS | `docs/dev/architecture.md:523`「K3 采纳率数据面随写入口激活（verdict 计数即分子分母）」（不建看板，数据面就位——符合 spec 口径） |
| 12 | lint + tsc + test:unit + test:visual 绿 | PASS | 本机（prisma generate 前置后）：lint 0 errors/0 warnings；tsc exit 0；test:unit 34 文件 356/356 绿（含集成测）；test:visual 以 CI 为证（8fd275f Visual regression: success；Lint/Typecheck/Build 同 run 全 success） |

## 探针记录（路由层直调，端口纪律合规）

脚本：scratchpad `f006-route-probe.ts`（直调 route.ts 导出 POST，构造 Request，不起 server）。
dev tenant 内建临时 project+kol+candidate → 7 次调用（见上表 #3/#4/#5）→ 测毕 cascade 清理。

**D-H 清态复核（测毕）：** tenants=仅 dev；kol=2526（2524 CSV + 2 视觉夹具 VK-FULL/VK-NULL，基线态不清）；
matchCandidate=0 / matchPlan=0 / pendingAction=0 / operationLog=0。✅

## 观察（不阻断，记录在案）

1. **[观察-测试稳定性]** `match-verdict.test.ts` 单文件冷跑首次断言 1（`loadMatchSurfaceData`）
   超 5000ms 默认 testTimeout 一次（本机 dev DB 2526 行 Kol，prisma/pgvector 冷启动）；复跑 2616ms
   过、全量套件与 CI 均绿。且该次超时使 afterAll 夹具清理延迟完成（曾短暂残留
   `test-tenant-m2b-verdict-40508`，已确认最终自清）。属本地冷启动边界，非产品缺陷；
   兜底 = CI 全量套件恒跑。建议后续顺手给该文件断言 1 加显式 timeout 余量。
2. **[观察-F008 域]** `architecture.md:1719` §12.7 KPI 表 K3 可算性仍标「演进（M2）」——F006 写入口
   落地后 K3 已现可算（:523 已注记激活）。属 F008「文档翻牌/批末新鲜度复核」范围，移交 F008 验收方参酌。

## 关键验证命令（复现）

```bash
npx prisma generate && npx tsc --noEmit && npm run lint
npm run test:unit                                    # 356/356（含 match-verdict 集成测打真库）
npx vitest run tests/integration/match-verdict.test.ts --reporter=verbose   # 5/5
node --env-file=.env --import tsx <scratchpad>/f006-route-probe.ts          # 路由层 200/400/404/幂等/零 PendingAction
gh run view 29982428017 --json jobs                  # F006 CI 五 job 全 success
```
