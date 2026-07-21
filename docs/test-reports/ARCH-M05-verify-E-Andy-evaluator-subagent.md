# ARCH-M05 验收报告 — E 组（F017 视觉基线扩展 + 阈值收紧 + 批末就绪回归）

> **验收者：** Andy/evaluator-subagent（隔离上下文）
> **日期：** 2026-07-21
> **被验 HEAD：** `f970124`
> **转派说明：** 本组原派其他 subagent，因通路故障转派本 evaluator。本 evaluator 此前仅执行过 B 组验收（F002-F005），**无任何实现上下文**，未参与 F017 或任何产品代码编写，独立性铁则成立。
> **依据：** features.json F017 acceptance（权威）· `docs/specs/ARCH-M05-spec.md` D10 + §5 · `playwright.config.ts` · `tests/visual/` 全量
> **边界：** 未修改任何产品代码、未改动任何基线 PNG、未改 playwright 配置、未写状态机 JSON。

## 0. 结论速览

**F017 → PASS**（8 clause 全 PASS，0 缺陷）
**批末就绪回归 → PASS**

| clause | verdict | 关键实证 |
|---|---|---|
| 六页+外壳全部入基线（route mock 固定动态数据） | **PASS** | darwin 12 + linux 12 = 24 张齐备；3 spec 全接 mockHandoffs/mockFonts |
| 断言阈值收紧 maxDiffPixels 1500 | **PASS** | `SNAPSHOT_OPTS` 单一出处，3 spec 全量消费，无一处旁路 |
| 先本地连跑 3 次抗抖动验证 | **PASS** | **3/3 全绿，12 passed × 3，26.4s/26.3s/28.3s** |
| 重生保持 `--update-snapshots=all` | **PASS** | `package.json` test:visual:update 实物 |
| F001-F016 全合入后单次重生 darwin+linux | **PASS** | linux 12/12 同一 bot commit `1a7dc35`；darwin 11 张 `f2a0b84` + 1 张字节未变 |
| 本地 test:visual 全绿 + CI visual 绿 | **PASS** | 本地 3 连绿；CI `29815799552` 四 job 全 success（visual 12 passed 27.2s） |
| e2e f010 闭环通 | **PASS** | **6/6**（真实网关 + 真实 DB，console error 0 条） |
| fe-audit 三脚本无回归 | **PASS** | token-scan 合计 **0** · dup-scan 无新页重复发明 · matrix 变化符合预期 |

**批末 L1 复跑：** `npm run typecheck` ✔ exit 0 · `npm run lint` ✔ 0 warnings/errors · `npx next build` ✔ exit 0（21 路由）

---

## 1. clause：六页 + 外壳全部入视觉基线 → **PASS**

`tests/screenshots/baseline/` 实物 24 张（darwin 12 / linux 12），逐一对应 12 用例：

| # | 基线名 | 覆盖 | spec |
|---|---|---|---|
| 1 | `en-today` | 今天（V1 + 三区外壳 S1/S2/S3） | dashboard.spec.ts |
| 2 | `campaigns` | 项目列表 V2 | workbench.spec.ts |
| 3 | `project-brief` | 详情外壳 V3 + Brief V4 | workbench |
| 4 | `project-match` | Match V5 | workbench |
| 5 | `project-reach` | Reach V6 | workbench |
| 6 | `project-delivery` | Delivery V7 | workbench |
| 7 | `project-insight` | Insight 环节 V8 | workbench |
| 8 | `creators` | 创作者库 V9 | workbench |
| 9 | `knowledge` | 游戏知识 V11 | workbench |
| 10 | `insight` | 洞察跨项目 V12 | workbench |
| 11 | `runs` | Agent 记录 V13 | workbench |
| 12 | `agent-canvas` | 生成式画布预览 | agent-canvas.spec.ts |

**六页工作台 + 五环节语法面 + 外壳全覆盖**，与 spec §2.4「六页+外壳全部入基线」一致。外壳（侧栏/navbar/Copilot）因常驻，随每张页面基线一并入网——12 张里都含三区外壳，覆盖强于"单独一张外壳图"。

**route mock 固定动态数据（沿 FE-REFACTOR F007 范式）：** `handoffs-mock.ts` 导出 `mockHandoffs`（`**/api/handoffs` → 固定 `HANDOFFS_MOCK`），3 个 spec 中 11 个 admin 用例全部接线（workbench 走 `test.beforeEach`，dashboard 走用例内显式调用）；`agent-canvas` 为 preview 路由不取 handoffs，只接 `mockFonts`——分类正确。
BL-FE-11 盲区确认已消：**today 基线人查可见协同交接卡为填充态**（「匹配 Agent ↔ 触达 Agent」+ 摘要文案），非 null 空白。

## 2. clause：断言阈值收紧 → **PASS**

`tests/visual/handoffs-mock.ts:72-77`：

```ts
/** BL-FE-13 拍板阈值：断言收紧至 maxDiffPixels 1500（重生仍走 --update-snapshots=all）。 */
export const SNAPSHOT_OPTS = {
  maxDiffPixels: 1500,
  animations: 'disabled',
  fullPage: false,
} as const;
```

**单一出处 + 全量消费核验：** 全仓 `toHaveScreenshot` 调用共 3 处（workbench 的 `shot()` helper、dashboard、agent-canvas），**全部传 `SNAPSHOT_OPTS`，无一处使用默认阈值或自定义宽松参数**。即 12 个用例 100% 走 1500px 紧阈值，无旁路。
`animations: 'disabled'` 一并消除 CSS 动画（S2-8 pulse 绿点、Toast 过渡）的尾帧抖动。

## 3. clause：先本地连跑 3 次抗抖动验证 → **PASS**（本组最强证据）

`npm run test:visual` 连续 3 次：

| 轮次 | 结果 | 耗时 |
|---|---|---|
| RUN 1 | **12 passed** | 26.4s |
| RUN 2 | **12 passed** | 26.3s |
| RUN 3 | **12 passed** | 28.3s |

**3/3 全绿，36/36 用例通过，零 flake。** 耗时高度稳定（26-28s，标准差 <1s），侧面印证抖动源已消除。

抗抖动三层措施逐一在实物中确认：
1. **导航策略**：全部 `waitUntil: 'domcontentloaded'`（非 networkidle，避免长连接挂起）✓
2. **单 worker**：`playwright.config.ts:11` `workers: 1`，注释记录了"1500px 紧阈值下 ~1/4 复现"的校准依据 ✓
3. **CDN 字体本地回放**（记录中的总根源）：见 §5 ✓

补充确定性手段：每用例 `getByText(...).waitFor({timeout:30_000})` 硬断言关键文案——**渲染为 null 即超时硬失败，杜绝空白图入基线**；`shot()` 内 `document.fonts.ready` + 1500ms settle 等图表尾帧。

> 环境记录（**非产品缺陷**，按 L1 环境前置检查排除）：首轮尝试时 `next build` 连续两次报 `PageNotFoundError: Cannot find module for page`，且**每次失败页面不同**（/admin/creators → /admin/insight）。排查为本机内存耗尽（`vm_stat` 实测可用页 6097 × 16KB ≈ 100MB），由本 evaluator 前序验收遗留的 playwright chromium 与 next-server 进程占用所致。清理后可用内存回到 ~2.6GB，同一 HEAD 清洁重建 **exit 0 且各路由 bundle 体积与 B 组首次构建逐字节一致**（如 /admin/creators 14.4 kB / 227 kB）。判定为环境资源问题，不计入 F017。

## 4. clause：重生保持 `--update-snapshots=all` → **PASS**

`package.json`：`"test:visual:update": "playwright test --update-snapshots=all"`。
`--update-snapshots=all` 与默认 `missing` 的差别在于强制重写既有基线（而非只补缺失），是 BL-FE-13「重生用全量、断言用紧阈值」两分口径的落点。CI 重生工作流 `update-visual-baselines.yml` 亦走该 npm script。

## 5. clause：字体夹具 → **PASS**

- `tests/visual/fonts/`：**28 个 `.woff2` + 3 个 `.css`**（`poppins.css` / `dmsans.css` / `dmsans-italic.css`），数量与记录一致。
- **gstatic 残留扫描：** `grep -rn "gstatic|fonts.googleapis" tests/visual/` 命中 4 处，**全部在 `mockFonts` 的 route 拦截逻辑内**（`page.route('**/fonts.googleapis.com/**')` / `page.route('**/fonts.gstatic.com/**')` + 2 行注释）——是"拦截并本地回放"的实现本身，**非未拦截的外链残留**。零真实 CDN 依赖。
- **三通道覆盖**：①googleapis CSS 请求 → 按 `family` 参数分发本地 CSS；②`/__visual_fonts__/*` → 本地 woff2；③**gstatic 直连兜底** → 按 basename 回放。三层无漏网。
- **mockFonts 三 spec 全接线：** workbench（beforeEach，覆盖 10 用例）· dashboard（用例内）· agent-canvas（用例内）= **12/12 用例全覆盖**。

## 6. clause：单次重生 darwin + linux → **PASS**

| 平台 | commit 分布 |
|---|---|
| linux 12 张 | **12/12 同属 `1a7dc35`**（`github-actions[bot]` 2026-07-21 `chore(visual): update linux baselines [skip ci]`）——单次重生，无零散补丁 |
| darwin 12 张 | 11 张属 `f2a0b84`（F017 基线扩展）；`agent-canvas-darwin.png` 仍属 `9df773e`（FE-REFACTOR F007） |

**agent-canvas darwin 未随 F017 变更 = 正确行为，非遗漏：** `/preview/agent-canvas` 页面在 ARCH-M05 未被改动，`--update-snapshots=all` 虽强制重写该文件，但渲染结果字节相同 → git 无变更可记。**实证：该基线在本次 3 连跑中于 1500px 紧阈值下 3/3 通过**，说明它与当前代码渲染一致、基线有效。commit 溯源的时间戳差异不构成缺陷。

## 7. clause：基线 PNG 人工查看 → **PASS**（抽查 4 张）

用 Read 工具逐张目视，核对无空白区块、与原型意图一致：

**① `en-today-darwin.png`** — 三区外壳完整（侧栏 285 含 KM mark/双字重品牌/6 入口/待办徽标 3·4·2/Agent 自动边界渐变 CTA｜玻璃 navbar 含指令栏+Agent 推进中绿点+头像｜Copilot 360 编排 Agent 紫渐变头）。主区：KPI ×4 **delta 有无两态并存**（3 +1 / 24 +6 / 4 无 delta / 8.4M +12%，未被统一）· 需要你确认雷达卡 ×3 含 **🔒 红色「对外不可撤销」irrev 标条件渲染**（星轨/暗域有、料理次元无——条件渲染正确）· Agent 编队 sqcard · **Copilot 内协同交接卡填充态**。零空白。

**② `project-match-darwin.png`** — 详情外壳导轨 ×5 带序号 01-05 + 三态图标（绿 check 已完成 ×2 / 白透明进行中 / 灰未开始 ×2）+ **on 态紫渐变底**；`.tag` 语法徽标「对比矩阵」+ 「这一环节的界面与其它环节刻意不同」宣示句在位。cmatrix：3 组合列 · **★ Agent 推荐仅 best 一列** · best 淡紫贯穿高亮 · **6 根 minibars**（hi 满/其余淡）· 行 触达/预算/风险/规模/**依据** · 「批准这组」×3（best 实心其余 ghost）· 「Agent 拿不准 · 待你裁定」+ 4 位候选。Copilot 头切为匹配 Agent 绿渐变。零空白。

**③ `creators-darwin.png`** — 🔒 lede IA 契约句「只做发现和分流…真正的触达、谈判必须回到项目内部」在位 · KPI ×4 · **筛选两行未合并**（平台 5 chips / 品类 5 chips，各自 on 态实心紫）· 8 列表（创作者/粉丝/品类 pill/受众匹配/历史合作/可信度/#AD/加入匹配 ghost）· 受众匹配均为实测数值（88%/82%/84%/71%/79%）无"待核"占位——与裁决 #2「有值即显」一致。零空白。

**④ `knowledge-darwin.png`** — 🔒 lede 素材→解析→喂环节链路句 · 左栏游戏 ×4（主题彩点+名+N 份素材，星轨协议 on 淡紫）· kb-dhead（48 图标+名+2 pill+重新分析 ghost）· **UploadZone 虚线框 + upload 图标 + 两行文案**渲染正常 · mat 行 4 条**按 type 分图标**（doc/video/doc/data）· **🔒 ProvenanceTag inline variant 在位**（「策略 Agent 基于 4 份素材分析（设定集·实机预告·媒体评测·玩家数据）」，裁决 #10 的 inline 态实物）· 卖点 bul ×3。零空白。

四张均字形渲染正常（中文 + 拉丁），无字体回退方框、无半加载态、无图表空框。

## 8. clause：e2e f010 闭环 → **PASS 6/6**

`npm run f010:e2e`（本 evaluator 自起 `next dev` + `npm run db:up` 既有容器 `newkolmatrix-dev-db` healthy + `.env` 真实网关凭据；`prisma migrate deploy` 预检 `No pending migrations`）：

```
[demo-handoff] 已存在，跳过（幂等）
── Part A：hello-agent 单 agent 闭环 ──
  ✓ match 环节：常驻专家头显示「匹配 Agent」（route→人格）
  ✓ NL → 流式 loop → search_kols → KOL 卡片流在画布渲染（闭环）
  ✓ 画布渲染 ≥1 张 KOL 候选卡片（实得 4）
── Part B：≥2 人格按 route 切换 ──
  ✓ reach 环节：专家头切为「触达 Agent」（≠ 匹配 Agent，人格随 route 切换）
── Part C：一次可视化 handoff ──
  ✓ 协同交接可视化渲染一次 handoff（匹配 Agent → 触达 Agent，来自 F002 Handoff 表）
  ✓ 闭环无 console error（捕获 0 条）
[f010-e2e] 结果：6 通过 / 0 失败
```

**这是真实全链路**（真实 aigcgateway 流式调用 + 真实 Postgres/pgvector 向量检索 + 真实 Handoff 表），非 mock。附录 A #2 的 `?stage=→?env=` 探针迁移在此同步验证（脚本走 `?env=`，Part A/B 均通）。

## 9. clause：fe-audit 三脚本无回归 → **PASS**

### 9.1 token-scan：合计 **0 findings**

七类扫描（font-family / dark-pairing / shadow / type-scale / muted-text-token 等）全部 0 处。

**豁免合理性复核（3 个豁免文件）：**

| 豁免文件 | 理由 | 复核结论 |
|---|---|---|
| `src/app/AppWrappers.tsx` | token 定义源（运行时 CSS 变量色阶注入点） | **成立**——CLAUDE.md 既定架构，此处 hex 即 token 定义 |
| `src/app/preview/agent-canvas/page.tsx` | 确定性视觉基线夹具页，刻意不写 dark: | **成立**——正是本组基线 #12 的取景页，像素确定性要求与 dark 完整性天然冲突 |
| `src/lib/design-tokens.ts` | JS 域 token 定义源 | **成立**，见下 |

**「design-tokens.ts / tailwind.config.js 双域出处」理由核验 —— 成立，且非重复：**

技术必要性经实物确认：Tailwind JIT 静态扫描源码文本，`from-[${JS常量}]` 不会生成任何 CSS（渐变静默消失）。因此存在**能力互斥的两个域**：
- **CSS 域**（className 可达）→ 出处只能是 `tailwind.config.js`
- **JS 域**（ApexCharts options / inline style / SVG 属性，className 覆盖不到）→ 出处只能是 JS 常量

**关键：二者是「分工」不是「同一值的两份拷贝」。** `design-tokens.ts` 文件内显式列出了归 CSS 域的 4 个值及其 tailwind 落点（`navyGlass` / `brandSoft.a/b/c` / 遮罩走既有 utility），并注明"不在本文件"——边界是写死的，不是靠自觉。

**漂移实测（跨域同名值逐一比对）：**

| 概念 | design-tokens.ts | tailwind.config.js | 一致 |
|---|---|---|---|
| brand-500 | `BRAND_500 = '#422AFB'` | `brand.500: '#422AFB'` (L428) | ✓ |
| gray-600 | `GRAY_600 = '#A3AED0'` | `gray.600: '#A3AED0'` (L181) | ✓ |
| chart green | `CHART_GREEN = '#01B574'` | `green.500: '#01B574'` (L364) | ✓ |
| navyGlass | 不定义（注明归 CSS 域） | `navyGlass: '#0b14374d'` (L167) | ✓ 无重复 |
| brandSoft | 不定义（注明归 CSS 域） | `brandSoft` (L169) | ✓ 无重复 |

**零漂移、零重复定义。** 双出处是 Tailwind 架构约束下的正确解，非债务。

### 9.2 dup-scan：无新页重复发明

9 类指纹（P1-P9）扫描，逐类复核新建页面是否绕开公共件自造：

- **P2 对话气泡** 3 命中**全在 `ChatBubble.tsx` 内** → 完全收敛 ✓
- **P5 页面头** 1 命中**全在 `PageHeader.tsx` 内** → 完全收敛 ✓
- **P4 卡片区块小标题** 0 命中 → 完全收敛 ✓
- **P1 brand 药丸** 10 命中：7 处在公共件自身（Badge/Button/UploadZone/HandoffCard），3 处在页面（`runs:94` tone 映射表、`creators:88`/`runs:217` **筛选 chip 激活态**）——筛选 chip 是交互控件语义不同于 Badge 徽标，非重复发明 ✓
- **P6/P7/P8** 各 1-2 命中，分别在 HandoffCard/ProvenanceTag 弹层、UploadZone/HandoffCollab 虚线、KolResultCards 灰标签——均为公共件内部，无页面级复制 ✓
- 最大类（muted 文本配对 `text-gray-600 dark:text-gray-400`）39 命中/15 文件：属**utility 配对而非组件**，token-scan 的 `muted-text-token` 类已判 0 findings（配对写法统一），不构成组件重复 ✓

**唯一可优化点（Info 级，不阻塞）：** `ProvenanceTag.tsx:91` 的 kv 行与 `DefinitionRow.tsx:21` 指纹相同（`shrink-0 font-semibold text-gray-400`），可考虑复用 DefinitionRow。属既有件微优化，非本批新增债。

### 9.3 component-matrix：变化符合预期

```
模板组件 215 | 项目组件 128 | src/app 入口 24 | 可达文件 110
used-as-is 6 · forked-modified 5 · self-built 38 · dead-in-repo 79 · removed 1
```

对照 F005 commit 记录的中间态（self-built 22 / 可达 76 / dead 78）：
- **self-built 22 → 38**（+16）：F006-F016 十一个页面 feature 新建的 envs/creators/knowledge/project 组件，符合预期 ✓
- **可达集扩张**：C 组 port 件 6/6 全部脱离 dead 进入可达（MiniStatistics·PieChart·progress forked-modified；BarChart·CircularProgress·LineAreaChart used-as-is）✓
- **dead-in-repo 78 → 79**（+1）：`charts/LineChart.tsx` 因唯一消费方 `sidebar/components/SidebarCard.tsx`（Horizon 模板 FreeCard）在 F003 侧栏改造后不再被 `sidebar/index.tsx` 引用而转入不可达。**这是 F003 按原型 S1-8 内联 side-cta 的正当副产物**，非回归 ✓

三脚本均无回归。

## 10. clause：CI 全 job success → **PASS**

`gh run view 29815799552`（main · workflow_dispatch）：

| Job | 结果 | 耗时 |
|---|---|---|
| Visual regression | ✓ success | 2m10s |
| Lint | ✓ success | 45s |
| Typecheck | ✓ success | 35s |
| Build | ✓ success | 1m21s |

CI annotation 记录 **`12 passed (27.2s)`** —— **linux 平台同样 12/12 且耗时与本地 darwin（26-28s）几乎相同**，双平台基线均有效、紧阈值在两平台都站得住。
唯一 annotation 为 `actions/checkout@v4` / `setup-node@v4` 的 Node 20 弃用警告（GitHub 平台侧，非本项目代码），不影响结论；可作为独立技术债登记。

**spec D10 期间口径已解除：** D10 允许 F003-F016 期间 visual job 红，要求 F017 后恢复全绿硬门槛——CI 与本地 3 连跑均证明门槛已恢复。

## 11. clause：批末 tsc + lint 复跑 → **PASS**

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | ✔ exit 0，无输出 |
| `npm run lint` | ✔ `No ESLint warnings or errors` |
| `npx next build` | ✔ exit 0，21 路由全出 |

（`next lint` 的 Next.js 16 弃用提示为工具链公告，非代码问题；可登记为独立技术债。）

---

## 12. 缺陷汇总

**F017 零缺陷。** 记录 3 条 Info 级观察，均不阻塞签收：

| ID | 位置 | 说明 | 建议 |
|---|---|---|---|
| E-1 | `tests/visual/workbench.spec.ts:12` | 注释仍写「全套并行（2 worker）下 CPU 竞争」，但 `playwright.config.ts:11` 已定 `workers: 1`。陈旧注释，无行为影响 | 顺手更新措辞 |
| E-2 | `ProvenanceTag.tsx:91` vs `DefinitionRow.tsx:21` | kv 行指纹重复，可复用 DefinitionRow | 择机收敛 |
| E-3 | CI + 本地工具链 | `actions/checkout@v4`/`setup-node@v4` Node 20 弃用；`next lint` 将在 Next 16 移除 | 登记技术债，独立批次处理 |

## 13. 测试产物

本组**未新增脚本**（既有 `npm run test:visual` / `f010:e2e` / 三 fe-audit 脚本已足够覆盖全部 clause，无需新写）。产出仅本报告。

复现方式：

```bash
npx next build                                   # 需 ≥2GB 可用内存
for i in 1 2 3; do npm run test:visual; done     # 期望 12 passed ×3
npm run db:up && npx next dev &                  # f010 需 dev server + DB
npm run f010:e2e                                 # 期望 6 通过 / 0 失败
node scripts/test/fe-audit-token-scan.mjs        # 期望 findings 0
bash scripts/test/fe-audit-dup-scan.sh
node scripts/test/fe-audit-component-matrix.mjs
gh run view 29815799552
```

## 14. 结论

**F017 → PASS，可签收。** 8 条 acceptance clause 全部有实物证据支撑，其中最关键的抗抖动要求以 **3 连跑 36/36 零 flake** 实证，CI linux 侧 12/12 独立佐证。批末就绪回归（tsc/lint/build/e2e/三审计/CI）全绿。

**跨组提示（不属本组评分）：** 本 evaluator 在 B 组发现 F002 的 O-1（`src/app/page.tsx` 探针漏项）与 F003 的 O-2（移动端 Copilot 抽屉单向不可关）两处需修缺陷。二者均**不影响 F017 基线有效性**——O-1 为 redirect 终点正确的绕行路径，O-2 只在 <1200px 断点触发而基线视口固定 1512×982。因此 F017 可独立签收；但**整批 signoff 须等 O-1/O-2 修复后复验**。

**本结论基于实物证据**（基线 PNG 目视 + 3 连跑输出 + 真实网关/DB 的 e2e 输出 + 审计脚本原始输出 + `gh run view` 原始输出），未采信任何实现过程叙述。
