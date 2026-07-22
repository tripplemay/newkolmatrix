# M2-A-MATCH 验收分报告 — 批次级就绪回归（READINESS）

- **验收人：** Andy/evaluator-subagent（隔离 fresh context）
- **日期：** 2026-07-22
- **被验对象：** main HEAD `3d93f72`（F009，产品树含 M2-A 全部 9 features）
- **口径：** spec §5 末段就绪回归：lint + tsc + test:unit（全量含集成）+ test:visual 全绿；三条 p2 探针 + f008:browser + f010:e2e + `m1c-readiness-f007-l1-substitute` 无回归（f007 原样探针已按 U3 退役——实测 `scripts/test/f007-browser-check.mjs` 不存在 + package.json `f007:browser` 零引用）
- **判定：PASS**（九道门禁全部自跑全绿；两处探针脚本修缮经独立代码审计确认为校准非弱化；观察项见 §10）

> **前次中断运行的处置声明：** 本次接手时工作区已存在一份未提交的 READINESS 报告草稿与
> `f008-browser-check.mjs` / `f010-e2e-check.mjs` 两处未提交修缮（推断为前一次被中断的
> READINESS 验收运行遗留）。按「评估基于实物」纪律，**草稿叙述一律不采信**：所有门禁本次
> 从零自跑取证；两处脚本修缮作为待审对象逐行对照产品代码独立审计（§7）。本文全部数字
> 均出自本次运行的命令输出。

---

## 0. 环境前置（testing-env-patterns 对照）与起始态取证

| 项 | 实测 | 结论 |
|---|---|---|
| `prisma generate` 先于 tsc（patterns §3） | 已先行执行再跑 tsc | ✅ 排除 client 陈旧误报 |
| Node 版本 vs `.nvmrc`（patterns §4） | 本机 v25.7.0；仓库无 `.nvmrc` | 无约束文件；全套件绿，无 jsdom 误报征兆 |
| dev DB | `newkolmatrix-dev-db` Up (healthy) | ✅ |
| :3000 | 起始 `lsof -ti :3000` 空（本验收专用） | ✅ |
| UI 实测形态 | 全程 standalone（`next build` 产物），未起 `next dev`（patterns §7） | ✅ |

**D-H 起始清态（`scripts/test/m2a-readiness-db-state.ts` 实测）：**
Tenant=1 · Project=4 · Kol=2524（embedding 非空 2524）· **MatchPlan=0 · PlanKol=0 ·
MatchCandidate=0** · PendingAction=0 · OperationLog=0 · Handoff=1（demo 行
id=`cmrsw008l00009y0984ad4qbn`，match→reach，**批前既有**）· Material=0 · GameKnowledge=0。
M2-A 扩展 D-H（Match 三表零行）成立。

## 1. next lint — PASS

`✔ No ESLint warnings or errors`（0 errors / 0 warnings，exit 0；无需走 warning 处理矩阵）。

## 2. tsc --noEmit — PASS

无输出，exit 0（prisma generate 之后执行）。

## 3. npm run test:unit（全量，含集成测试）— PASS

vitest v4.1.10：**28 文件 / 307 tests 全过**（Duration 1.27s，exit 0）。集成测试打真库、
夹具租户自清——本次做了受控实验：**重跑 test:unit 并在同一命令链内立即取证**，
PendingAction=0 / OperationLog=0 / Tenant 仅 Dev Tenant 1 行，**test:unit 自身零残留实锤**
（首跑后一度观测到 PendingAction=1/OperationLog=1 瞬时行，定性见 §10 OBS-R3）。

## 4. npm run build — PASS

exit 0；路由清单含本批新增 `/api/match/plans/[id]/approve`、`/api/match/refresh`、
`/api/nav-badges`（均 ƒ Dynamic）。

## 5. npm run test:visual（空态基线环境）— PASS

环境：`DATABASE_URL`（.env 真值）+ `AIGCGATEWAY_BASE_URL=http://127.0.0.1:9` +
`AIGCGATEWAY_API_KEY=probe`（伪凭据 = CI 基线态）；跑前 :3000 空闲 + D-H 清态已核（§0）。
Playwright **13/13 passed（23.9s，exit 0）**，webServer 由 playwright 自起自灭（跑后 :3000
复空、Match 三表仍 0 行——lazy 生成在伪凭据下未落任何行）。

**F005 CI 降级安全当场活证：** 每次访问 project-* 页面时 webServer stderr 打出
`[match] 首访 lazy 生成失败，降级空态占位（CI 无凭据属预期）: fetch failed`（log warn
不抛错），页面照常渲染、基线照常匹配——「空态占位 = 基线态」口径闭环。

## 6. 探针段（真环境 standalone，`.env` 真凭据起 :3000）

standalone 启动日志同时旁证 F006 注册表：
`[jobs] 例程调度已启动（health-scan @ 0 2 * * * / nightly-screen @ 30 2 * * *）`。

| 探针 | 结果 | exit |
|---|---|---|
| `npm run p2:f001`（抽屉四关闭路径，桌面+移动） | **12 passed, 0 failed** | 0 |
| `npm run p2:f002`（深色持久化 + pre-paint + F-live/F-mut 活性自证） | **14 passed, 0 failed** | 0 |
| `npm run p2:f004`（HandoffPanel 生产/夹具同壳） | **15 passed, 0 failed** | 0 |
| `node scripts/test/m1c-readiness-f007-l1-substitute.mjs` | **10 passed, 0 failed**（含 demo handoff 在场、console 0 error） | 0 |
| `npm run f008:browser`（**严态复现**：跑前清 Match 三表零行，首访必走 lazy 慢路径） | **12 passed, 0 failed** | 0 |
| `npm run f010:e2e`（真对话，L2 已授权） | **6 通过 / 0 失败**；canvas 实渲染 **20** 张 KOL 卡（计数读自 canvas 头）；Part B 人格切换、Part C handoff 可视化、console 0 error 全绿 | 0 |

**lazy 生成真网关活证（p2 探针途中顺带取证）：** p2 段访问项目页后 Match 三表出现
3 plans / 30 PlanKol / 20 candidates（= 3 组 + topN 20 设计值）；f008 跑前清零复现严态后
仍 12/12——F005 首访同步生成路径在真凭据下工作正常。

## 7. 两处探针脚本修缮的独立审计（前次运行遗留，未提交）

按 Evaluator 测试域职权审计，**结论：两处均为校准/加严，非断言弱化**。

1. **`scripts/test/f008-browser-check.mjs:84`** — 固定 `waitForTimeout(1200)` → 条件等待
   `text=目标 Brief`（30s 超时 catch 吞掉）。审计：后续 `ok()` 断言（五环节齐全 :86-87、
   「刻意不同」宣示句 :88）原样保留，内容不到场时照常判红——catch 吞的只是等待超时，
   语义零变更。成因合理：F005/P2 起零 plans 项目详情 RSC 首访同步 lazy 生成（本次严态
   复现实证首访确需 >1.2s）。
2. **`scripts/test/f010-e2e-check.mjs:69-86`** — 等待/计数锚从页面级
   `getByText(/位候选|% 匹配/)` 收窄进 `<aside>` + ` 位候选 · 「` 后缀。审计（三个主张
   逐一核到代码实物）：(a) match 环节页自身渲染 `{candidates.length} 位候选` meta
   （`src/components/envs/match/index.tsx:330`，V5-14 🔒 元素）——F005 接真后页面级锚
   会先命中它，legacy id `starlight-protocol` 深链不解析为项目行 → 「0 位候选」使等待支
   假绿/计数支误读；(b) `<aside>` 全 src 唯一（`src/components/copilot/CopilotPanel.tsx:321`，
   grep 全仓单命中）；(c) ` 位候选 · 「` 为 canvas 头独有格式
   （`src/components/copilot/canvas/KolResultCards.tsx:100`）。收窄后断言对象回归
   ARCH-M05 F017 原意（KolResultCards 单一权威输出）——**加严**。本次真对话下计数支
   读到实值 20，锚点活性有正向实证。

## 8. L2 用量记录（spec §4 口径：最小用量）

- 真对话 ×1（f010 Part A：1 条 NL 指令经 /api/agent → 网关 chat + search_kols 查询 embed）。
- 真 embedText（lazy 候选生成事件）×2（p2 段项目页首访 ×1、f008 严态首访 ×1；每次 1 条
  查询文本 embed + pgvector 检索）。
- 无图片/vision 调用；无生产写入。

## 9. 产物纪律与 D-H 复原自证

- **零产品代码改动：** 终态 `git status` 仅 `scripts/test/`（两处前次遗留修缮 + 本次新增
  `m2a-readiness-db-state.ts` / `m2a-readiness-residue-probe.ts` 取证脚本）与
  `docs/test-reports/`（本报告 + 并行 fan-out 各 feature 分报告，非本人产物未触碰）。
- **测毕清理：** :3000 进程已杀（`lsof` 复核空）；运行产生的 Match 三表行（3 plans /
  30 PlanKol / 20 candidates，均 lazy 生成产物）全删；PendingAction/OperationLog 复核 0。
- **demo-handoff seed 处置：** f010 seed 幂等跳过（`[demo-handoff] 已存在，跳过`），该
  Handoff 行**批前既有**（起始态已取证同一 id）——按「DB 终态与起始清态一致」治理准则
  保留不删（删除反而偏离起始态，且 m1c-f007 替代探针依赖其在场）。
- **DB 终态 = 起始清态逐项一致：** Tenant=1 · Project=4 · Kol=2524（embedding 2524）·
  MatchPlan=0 · PlanKol=0 · MatchCandidate=0 · PendingAction=0 · OperationLog=0 ·
  Handoff=1（同一行 id=`cmrsw008l00009y0984ad4qbn`）· Material=0 · GameKnowledge=0。

## 10. 观察项（非 blocker，供 signoff / 后续批次引用）

- **OBS-R1｜首访同步生成的秒级阻塞（by-design）：** 零 plans 且 cur≥match 的项目详情
  首访同步走真网关 lazy 生成（spec P2 明文设计，失败静默降级；F006 例程有预生成路径
  兜底）。本次严态 f008 实证固定 1.2s 等待不够、条件等待 30s 内到场。若 M2-B/M3 引入
  更重生成链路，建议届时评估流式/后台化。
- **OBS-R2｜旧 id 深链的 match 面为空态（by-design D2）：** `starlight-protocol` 不解析
  为项目行（RSC 按 slug|id|publicId 解析），match 面诚实空态「0 位候选」。别名仅为
  brief mock 层兼容，生产 UI 全走 cuid Link，无用户可达路径。
- **OBS-R3｜并行 fan-out 验收的 DB 瞬时污染（验收编排注意，非产品缺陷）：** 首跑
  test:unit 后一度观测 PendingAction=1/OperationLog=1，数秒后自清；受控实验证明
  test:unit 自身零残留（§3），且本次运行期间并行 fan-out 各 feature 分报告陆续落盘——
  定性为并行 evaluator 的中间产物。**教训：** 多 evaluator 并行共享同一 dev DB 时，
  依赖 D-H 清态的门禁（视觉基线快照点）应在取证当刻复核清态而非信任起始一次取证
  （本次 test:visual 跑前已当刻复核，未受影响）。
