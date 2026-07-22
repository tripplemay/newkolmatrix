# M1-D-KNOWLEDGE F004 — knowledge 页面接真 + mock 退役 · 首轮验收（round 1）

- **验收人：** Andy/evaluator-subagent（隔离 fresh context）
- **日期：** 2026-07-22
- **被验 commit：** `426ee0b`（F004）+ `7f213b4`（linux 基线重生）；验收基线 HEAD = `ecde6cd`
- **结论：PASS**（acceptance 全部子项实证满足）

---

## 1. 验收环境

- 本地 dev DB：docker `newkolmatrix-dev-db`（healthy），基线态实测确认：Game 4 行
  canonical（game-xg/lc/aw/mf）、Material 0 行、GameKnowledge 0 行
- Node v25.7.0（项目无 .nvmrc；与 M1 前三批同环境，CI 为独立守门）
- L1 前置：`npx prisma generate` 先于 tsc（testing-env-patterns §3）
- UI 实测走 standalone 产物（testing-env-patterns §7）：`npm run build` →
  `node scripts/serve-standalone.mjs`（127.0.0.1:3000，验收独占，测毕已杀）

## 2. 测了什么 · 命令 · 关键输出

### 2.1 L1 静态四件套（本机全绿）

| 命令 | 结果 |
|---|---|
| `npx tsc --noEmit` | exit 0，零错误 |
| `npm run lint` | ✔ No ESLint warnings or errors |
| `npm run test:unit` | **20 文件 / 224 用例全过**（含 `tests/unit/knowledge-page-contract.test.ts` 19 用例：六值 type→四图标槽、四态→三态视图、toMaterialView 组装、provenanceLabel 两口径、findKnowledgeGame D2 回退、调色板确定性） |
| `npm run test:visual` | **13/13 全过**（含 `knowledge visual baseline`，对 426ee0b 重生的 knowledge-darwin.png） |

### 2.2 force-dynamic + prerender-manifest（build 实证）

- `src/app/admin/knowledge/page.tsx:13` = `export const dynamic = 'force-dynamic'`（实物在）
- `npm run build` exit 0；build 输出 `ƒ /admin/knowledge`（Dynamic, server-rendered on demand）
- `.next/prerender-manifest.json` 程序化核验：routes 12 条 + dynamicRoutes 0 条，
  **knowledge 命中 = 0**

### 2.3 RSC 真直读 · 改→验→复原（Evaluator 独立复做，非采信叙述）

standalone 起服后 curl SSR HTML：

1. **基线态**：四游戏名（星轨协议/料理次元/暗域拓荒/萌宠农场）全渲染 + `0<!-- --> 份素材` ×4 +
   「上传素材开始分析」+「待解析——上传素材后由策略 Agent 生成」全部命中
2. **改→验**：psql 插入 selling_point 链头（structured.points 含探针串
   `EVAL-PROBE-独特卖点-9F3K7`）→ **不重建、立即刷新即现**，溯源行变
   「策略 Agent 基于 1 份素材分析」
3. **链头口径**：再插新链头 `EVAL-PROBE-新链头-X2Q8M` 并把旧行 `supersededById` 指新 →
   页面**旧头 0 命中、新头即现**（读取恒取 supersededById IS NULL 在页面层成立）
4. **复原**：DELETE 探针行 → 探针串 0 残留，「待解析」空态回归

### 2.4 D2 failed 红态 + parseError 明示（运行时实证）

psql 插入 failed Material 行（video 族，parseError=「类型暂不支持解析…」）→ SSR 命中
「解析失败」徽标 + parseError 文案；DELETE 后回零。

### 2.5 浏览器实测（Playwright chromium，探针脚本置系统临时目录，测毕环境复原）

探针 suite 6 用例全绿（S1-S5 一次串行 run + S6 补充 run）：

| 探针 | 断言 | 结果 |
|---|---|---|
| S1 初始渲染（1512×982） | 4 游戏 + 素材空态 +「待解析」占位 + 特点卡三区（卖点/目标受众/合规红线）区块结构保留 | ✅ |
| S2 kbGame URL 化 | 点料理次元 → URL 变 `?game=<id>`、aria-pressed=true、素材卡头切换 | ✅ |
| S3 D2 回退 | `?game=bogus-id-404` → 回退首个游戏（星轨协议选中）不抛错 | ✅ |
| S4 **[L2] 上传→自动解析→轮询→刷新** | 上传 172B 中文 txt 夹具 → toast「已上传…解析中」→ 素材行现 + 琥珀「解析中…」→ 绿「AI 已解析」→ router.refresh 后特点卡真数据：卖点 2 条 / 受众 60%+40% Progress / 红线 2 条红 shield +「基于 1 份素材分析」+「素材库 · 1 份」+ toast「解析完成，游戏特点已更新」（截图 shot-parsed.png 逐项目视确认） | ✅ |
| S5 两视口 | 720×900 重载：单列堆叠（GameRail→素材卡→特点卡）内容完整无溢出（截图 shot-720.png） | ✅ |
| S6 重新分析接线 | 零素材点「重新分析」→ 引导 toast「暂无可重新分析的素材——请先上传」（按钮 wired；其 parse 链路与 S4 自动解析共用同一 `POST /api/materials/{id}/parse` + 轮询机制，端点已由 S4 实测） | ✅ |

DB 侧同步实证：S4 后 Material=parsed + parsedAt 非空；GameKnowledge 三 kind 各 1 行、
全部 is_head、sourceMaterialIds=[素材 id]（FR-11.9 溯源非空）、confidence=0.95。

### 2.6 mock 退役 needle 全仓 grep（终态判据）

| needle | 范围 | 命中 |
|---|---|---|
| `mock/knowledge` | 全仓 *.ts/tsx/js/mjs（除 node_modules/.next/.git） | **0** |
| `mockGameKnowledge` | src/ tests/ scripts/ | **0** |
| `GameKnowledgeEntry` | src/ tests/ scripts/ | **0** |
| `1100`（mock 时序） | src/components/knowledge/ | **0** |

`src/lib/data/mock/knowledge.ts` 已在 426ee0b 物理删除（-192 行）；`mock/index.ts`
登记表已翻牌「已退役」。仅存 `setTimeout` 为 KnowledgeWorkbench:111 轮询间隔
（POLL_INTERVAL_MS=1500），非 mock 时序。

### 2.7 基线重生对账 + CI 闭环

- `knowledge-darwin.png` 于 426ee0b 重生（289390→276915 bytes）；
  `knowledge-linux.png` 于 7f213b4 由 update-visual-baselines workflow 重生（294345→279810）
- waitFor 校准 + 空态硬断言 ×3 实物在 `tests/visual/workbench.spec.ts:84-89`
  （星轨协议 Game 行真渲染 / 上传素材开始分析 / 待解析占位——数据源消失或空态回归均硬红）
- CI 轨迹与 spec §4.4 预期一致：F004 首推 CI **failure**（linux 基线未重生，预期红）→
  update-visual-baselines **success** → F005/F006 推送 CI **success**（含 visual job）闭环

## 3. Acceptance 逐条判定

| # | 子项 | 判定 | 证据 |
|---|---|---|---|
| 1 | page.tsx RSC 直读 + force-dynamic 声明 | **PASS** | §2.2 + §2.3 |
| 2 | build 后 prerender-manifest 不含该路由 | **PASS** | §2.2（0 命中） |
| 3 | Game 全列 + Material 列表 + GameKnowledge 链头 → 可序列化 prop | **PASS** | §2.3（含 supersede 链头口径实证）+ page-contract.ts 纯数据契约 |
| 4 | KnowledgeWorkbench 'use client' + 上传→parse→轮询→router.refresh | **PASS** | §2.5 S4 全链浏览器实测（L2 真网关） |
| 5 | 重新分析接 parse API | **PASS** | §2.5 S6 + S4 同端点实测 |
| 6 | mock 时序与 mock/knowledge.ts 退役，needle 零残留 | **PASS** | §2.6 |
| 7 | D2 空态/降级（无素材 / failed 红态+parseError / 待解析占位保结构） | **PASS** | §2.4 + §2.5 S1；无游戏空态为代码分支（Workbench:213-217，库内恒有 4 Game 不破坏基线实测，代码层核验） |
| 8 | knowledge.png 基线对账重生 + waitFor 校准 + 空态硬断言 | **PASS** | §2.7 + 本机 visual 13/13 |
| 9 | 运行时改→验→复原实证 | **PASS** | §2.3（Evaluator 独立复做） |
| 10 | 两视口实测 | **PASS** | §2.5 S1（1512）+ S5（720） |
| 11 | lint + tsc + test:unit + test:visual 绿 | **PASS** | §2.1 本机四绿 + §2.7 CI 闭环 |

## 4. [L2] 真网关用量记录（已授权，最小素材）

| 调用 | 模型 | in / out / total tokens | 估算成本 |
|---|---|---|---|
| S4 run1（探针脚本 locator 误报中断后解析仍完成） | deepseek-v3 | 309 / 93 / 402 | ≈$0.000116 |
| S4 run2（修正 locator 后完整链路） | deepseek-v3 | 309 / 94 / 403 | ≈$0.000116 |
| **合计** | | **805 tokens** | **≈$0.000232** |

素材 = 172 bytes 中文 txt 夹具（自建自清）。vision 路径未在本 feature 消耗
（属 F003 验收范围；F004 页面链路用文本素材已足证）。

## 5. 环境复原（D-H 决定论纪律）

- Material / GameKnowledge：**双零行**（终态 psql 实测；Game 4 行 canonical 未动）
- `.materials/`：已删除（恢复不存在态）
- standalone 服务进程已杀，127.0.0.1:3000 已释放
- 探针脚本 / 截图 / 夹具全部在系统临时目录，未入仓
- `test-results/.last-run.json`：`npm run test:visual` 常规副产物（gitignored），保留

## 6. 观察项（不阻断）

- 首轮 S4 失败为**探针脚本自身** locator 严格模式误报（toast 文案含文件名与素材行双命中），
  非产品缺陷；修正后复跑全绿。
- 产品代码零改动（src/ prisma/ 配置全程只读）。
