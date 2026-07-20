# FE-REFACTOR 验收报告 — B 路（F003 / F004 / F007 视觉证据链）

- **批次：** FE-REFACTOR（普通批次，7 features 全 executor:generator）
- **阶段：** verifying（首轮）
- **验收范围：** F003 HandoffCard 容器/呈现拆分 · F004 卡片表面语言统一 · F007 视觉基线单次重生 + CI 盲区修复
- **验收人：** Andy/evaluator-subagent（隔离上下文，fresh context）
- **验收日期：** 2026-07-20
- **被验 HEAD：** `60c7ef6`（产品代码等同 `652ea1d`→`bafd917` 链；`60c7ef6` 仅动 progress.json）
- **口径来源：** `features.json` acceptance + `docs/specs/FE-REFACTOR-spec.md` §2/§3/§4

> 本报告结论全部基于实物：源码 / git diff / 本地测试运行输出 / 4 张基线 PNG 人查 / CI run 记录。未采信任何实现过程叙述。

---

## 0. 总判定

| Feature | 判定 |
|---|---|
| **F003** HandoffCard 容器/呈现拆分 | **PASS** |
| **F004** 卡片表面语言统一 | **PASS** |
| **F007** 视觉基线单次重生 + CI 盲区修复 | **PASS** |

附 4 条观察项（OBS-1..4），其中 **OBS-3 建议入 backlog**（视觉断言 2% 容忍带削弱本批次 P0 目标，非本批 acceptance 覆盖项，不计 FAIL）。

---

## 1. 环境前置（L1）

| 项 | 结果 |
|---|---|
| standalone 产物 | 已按 HEAD 源码重新 `npx next build --no-lint`，EXIT=0（避免拿 12:15 旧产物验 12:21 之后的代码） |
| `tsc --noEmit` | EXIT=0，无输出 |
| `next lint` | `✔ No ESLint warnings or errors`（仅 next lint 弃用提示） |
| `npm run test:visual` | **2 passed (6.7s)**，agent-canvas + dashboard 全绿；运行后 `git status --short tests/` 干净（未误改写基线） |
| 已知环境误报排除 | 未触发 prisma generate / Node 版本 / RLS 视角类误报；视觉用 route mock 不依赖 DB |

**批次级脚本对账（D4，作为 F003/F004 佐证）：**

- `scripts/test/fe-audit-token-scan.mjs` → **合计 findings: 0**（`shadow` 类 0 处、`muted-text-token` 0 处、`type-scale` 0 处）
- `scripts/test/fe-audit-dup-scan.sh` → P6「交接卡 HandoffCard 外框」**命中 1 处且唯一落在 `common/HandoffCard.tsx:48`**（克隆消失）；P9「可点卡片 hover」命中 2 处且**语言一致**（`campaigns/page.tsx:22` 与 `SurfaceCard.tsx:23` 均 `hover:shadow-xl`）

---

## 2. F003 — HandoffCard 容器/呈现拆分（P0）· PASS

| # | Acceptance clause | 判定 | 实物证据 |
|---|---|---|---|
| 3.1 | 新增 `common/HandoffCard` 纯呈现组件，props `{fromName,toName,summary,artifactType,artifactRef,defaultOpen?,collapsible?}` | **PASS** | `src/components/common/HandoffCard.tsx:10-19` 接口逐字段与 spec §2 F003 一致，无多余 props；组件内无 fetch/无数据源依赖，纯 props 驱动 |
| 3.2 | HandoffCollab 改容器（fetch→props） | **PASS** | `HandoffCollab.tsx:34-46` 只剩 `fetch('/api/handoffs')` + `:57-66` 列表编排；对比 `git show 6625935^:...HandoffCollab.tsx` 原文件内嵌的 `HandoffItem`（含 chevron/摘要/交接物全部 markup）已整体移出，全仓 `grep -rn "HandoffItem" src/` **命中 0** |
| 3.3 | 空态逻辑保留 | **PASS** | `HandoffCollab.tsx:48` `if (!loaded || handoffs.length === 0) return null;` 与重构前逐字符相同（旧文件同行同语义） |
| 3.4 | 预览页删手抄克隆体，改 import 真实呈现组件 + 夹具 props | **PASS** | `preview/agent-canvas/page.tsx:12` `import HandoffCard from 'components/common/HandoffCard'`；`:35-43` 传 `HANDOFF_FIXTURE`（`fixture.ts:53-60` 定值）+ `collapsible={false} defaultOpen`；克隆 markup 已删（dup-scan P6 全仓仅 1 命中） |
| 3.5 | 生产与预览共用同一呈现层（import 图证据） | **PASS** | `grep -rn "HandoffCard" src/`：消费者恰为 `copilot/HandoffCollab.tsx:11` 与 `preview/agent-canvas/page.tsx:12`，二者指向同一模块 `components/common/HandoffCard`，无第二实现 |
| 3.6 | dark: 变体一致 | **PASS** | 共用同一组件 → dark: 类由单一来源产生（`HandoffCard.tsx:48/69/70` 的 `dark:border-white/10 / dark:bg-navy-700 / dark:border-white/5 / dark:text-gray-300`）；旧克隆体的 dark: 漂移随克隆删除而消解 |
| 3.7 | lint + tsc 绿 | **PASS** | §1 |
| 3.8 | 呈现层视觉等价（D2） | **PASS** | agent-canvas 基线 old/new 人查（§4.2）：交接卡结构、字段、图标、文案完全一致，仅表面语言与 gray-600 变化 |

**OBS-1（不影响判定）：** 预览页保留了名为 `StaticHandoffCard` 的**本地组合包装函数**（`page.tsx:23-46`）。其内部已无手抄卡片 markup，但外层"容器 chrome"（`SurfaceCard` + `SectionLabel` + `MdGroups` + 中文标签串 `协同交接 · 多 Agent 联动 · 点开看交接`）与 `HandoffCollab.tsx:51-55` 逐字重复。spec §2 F003 只要求**单卡呈现层**共用，容器 chrome 未列入收敛范围，故不计 FAIL；若后续标签文案变更，两处需同步（漂移风险已记录）。

---

## 3. F004 — 卡片表面语言统一 · PASS

| # | Acceptance clause | 判定 | 实物证据 |
|---|---|---|---|
| 4.1 | 新增 `common/SurfaceCard` 轻量表面 | **PASS** | `SurfaceCard.tsx:14-29`，基类 `rounded-2xl border border-gray-200 bg-white dark:border-white/10 dark:bg-navy-700`，无 shadow-sm/md；`interactive` 附 `transition hover:shadow-xl` |
| 4.2 | 收敛 5 处自写卡片（today:25 / KolResultCards:38 / preview:20 / HandoffCollab:83 / ExpertScope:14） | **PASS** | `git show a76a324 -- src/` 逐处替换均在 diff 中：`today/page.tsx` TodoRow、`KolResultCards.tsx` KolCard、`preview/agent-canvas/page.tsx` 外框、`HandoffCollab.tsx` 外框、`ExpertScope.tsx` 外框 = 5/5 |
| 4.3 | 豁免 HandoffCollab:29 / preview:25（手风琴内层）如实保留 | **PASS（豁免核对属实）** | 手风琴内层现落在 `HandoffCard.tsx:48`，仍为 `rounded-xl border border-gray-200 bg-white`**未套 SurfaceCard**，与 spec §2 F004「豁免」及 commit message 记载一致；dup-scan P6 亦显示其独立存在 |
| 4.4 | 可点卡片 hover 统一 `hover:shadow-xl` | **PASS** | 收敛前三套语言：`today:25 hover:border-brand-200 hover:shadow-md`、`KolResultCards:38 transition hover:shadow-md`、`campaigns:22 hover:shadow-xl`（`git grep a63a1a5`）；收敛后全仓 `grep -rn "hover:shadow" src/` 产品可点卡片仅剩 `SurfaceCard.tsx:23` 与 `campaigns/page.tsx:22`，**均为 shadow-xl**（`navbar/Configurator*.tsx` 的 `hover:shadow-[0px_18px_40px_...]` 为模板 identical 文件，非本批范围） |
| 4.5 | 清除 shadow-sm/md 10 处（含 Button.tsx:27×2） | **PASS** | 基线 `a63a1a5` 全仓 `shadow-sm|shadow-md` **11 个 token / 10 行**（today×1、preview×2、Button:27×1、CopilotPanel×3、ExpertScope×1、HandoffCollab×1、KolResultCards×2）；HEAD 全仓 `grep -rn "shadow-sm\|shadow-md" src/ tests/ tailwind.config.js` **仅剩 3 条注释**（`Button.tsx:28` / `SurfaceCard.tsx:2` / `ChatBubble.tsx:14`），**零代码命中**。Button.tsx:27 的 `shadow-md` + `hover:shadow-lg` 双去除见 `a76a324` diff。token-scan `shadow` 类 0 findings 交叉印证 |
| 4.6 | lint + tsc 绿 | **PASS** | §1 |

**OBS-2（不影响判定，需记账）：** 收敛副产品的两处**边框 token 变化**未在 spec §3 D2 的拍板枚举清单（hover shadow-xl / gray-600 / 术语 / shadow 收敛 / campaigns:21 漂移修复）中逐条列名：

- TodoRow 边框 `border-gray-100` → SurfaceCard 的 `border-gray-200`（基线实测像素 `#EEF0F6` → `#DADEEC`），dark 侧 `white/5` → `white/10`
- ExpertScope 由「仅左侧 4px brand 条 + shadow-sm」变为「四边 gray-200 边框 + 左侧 brand 条」

二者是 acceptance 4.2「收敛到统一表面」的**必然结果**且 commit message 已明示（"border-gray-100→200 归一"），判定为 F004 范围内的有意改动，非意外漂移。已在基线人查中逐处确认（§4.1）。

---

## 4. F007 — 视觉基线单次重生 + CI 盲区修复 · PASS

| # | Acceptance clause | 判定 | 实物证据 |
|---|---|---|---|
| 7.1 | `tests/visual` 给 `/api/handoffs` 加 route mock 固定夹具 | **PASS** | `tests/visual/dashboard.spec.ts:9-22` `HANDOFFS_MOCK` 全字段定值（含固定 `id`/`createdAt`）；`:25-27` `page.route('**/api/handoffs', route.fulfill({json}))` 在 `goto` 之前挂载 |
| 7.2 | 本地与 CI 一致 + HandoffCollab 填充态入基线 | **PASS** | `:32` `getByText('协同交接').first().waitFor()` —— 若容器再次渲染 null，测试会**超时硬失败**而非静默留白；夹具与 `preview` 的 `HANDOFF_FIXTURE` 同款（match→reach） |
| 7.3 | F001-F005 全合入后**单次**重生全部基线，一个 commit | **PASS** | darwin 两张在 `9df773e`（唯一一次 darwin 基线改写）；linux 两张在 `7d34d00`；`git log` 显示 F001-F005（`f7fc3cf`..`bafd917`）全部早于二者，期间无基线 commit |
| 7.4 | linux 基线经 CI workflow 重生并 commit | **PASS** | `git show --format=fuller 7d34d00`：Author/Committer 均 `github-actions[bot] <github-actions[bot]@users.noreply.github.com>`，message `chore(visual): update linux baselines [skip ci]`，改 `agent-canvas-linux.png`(117818→117764) 与 `en-today-linux.png`(117451→126149)；`update-visual-baselines.yml:32-42` 即该 bot commit 的产生路径 |
| 7.5 | `npm run test:visual` 本地全绿 | **PASS** | 重建 standalone 后 **2 passed**（§1） |
| 7.6 | CI visual job 绿（对新 linux 基线） | **PASS** | `gh run view 29772314482`：conclusion **success**，`headSha = 7d34d00a70c...` —— **恰为 linux 新基线那次 commit**，即该 run 验证的就是新基线；Visual regression job success（1m50s，注记 `2 passed`），Typecheck/Build/Lint 亦全绿。`ci.yml:83-84` visual job 无 continue-on-error，硬失败 |
| 7.7 | 基线 diff 逐张对账，变化仅含拍板改动 | **PASS（附 OBS）** | 见 §4.1–§4.3，4 张 PNG 逐张人查 |

### 4.1 en-today（darwin + linux）逐张人查

对照对象：`652ea1d`（重生前）vs HEAD。像素差：darwin **1.53%**、linux **1.44%**；变更条带 4 段，两平台一致（y74-165 / y192-381 / y392-459 / y931-962）。

| 变更区 | 观察到的变化 | 归属 |
|---|---|---|
| ExpertScope 卡（右栏 y74-165） | 标签「**隔离**」→「**边界**」；卡面由 shadow-sm 无边框 → gray-200 四边边框、左侧 brand 条保留 | 拍板 BL-FE-09（F001）+ F004 表面语言 |
| 页头副标题（y~157） | 灰度加深一档 | 拍板 BL-FE-10 gray-500→600（F005） |
| Copilot agent 气泡（y~192-235） | shadow-sm 光晕消失，改为纯 bg 与底色分界；文字/几何不变 | F004 shadow 清零 |
| 协同交接卡（右栏 y~265-330） | 外框 shadow-sm → 边框；SectionLabel 灰度加深；**内层手风琴卡（匹配 Agent → 触达 Agent）完全不变**（豁免项保持） | F004 + 拍板 gray-600 |
| TodoRow ×3（主区） | 边框 `#EEF0F6`→`#DADEEC`；备注文案灰度加深；**Badge 4× 放大逐像素比对为完全等价**（位置/尺寸/圆角/文案全同） | F004（OBS-2）+ 拍板 gray-600 |
| 发送按钮（y931-962） | 圆形渐变按钮 disabled 态由 40% → 50% 不透明度（中心像素 `(228,224,254)`→`(221,216,254)`，圆内 656px 变化、圆外仅 111px 说明非阴影所致） | F002 收敛 Button `iconOnly`（commit `5341d7e` message 已声明"disabled 态透明度 40→50 归一组件规范"）→ **OBS-4** |

**linux 专有关键发现（BL-FE-11 闭环的决定性证据）：** 旧 `en-today-linux.png` 在 agent 气泡下方是**一片空白**——CI 无 DB，HandoffCollab 恒 return null，基线静默编码了空区域；新基线该处出现完整「协同交接」卡。**生产 HandoffCollab 的视觉回归覆盖由零变为有**，与 F003 的 P0 目标闭合。（darwin 侧因本地有 DB，旧基线已含该卡，故仅 linux 呈现此差异。）

### 4.2 agent-canvas（darwin + linux）逐张人查

像素差：darwin **3.21%**、linux **3.41%**；条带 15 段，全部落在内容列 x546-965。

| 变更区 | 观察到的变化 | 归属 |
|---|---|---|
| ExpertScope | 「隔离」→「边界」；边框化 | 拍板 + F004 |
| 用户/agent 气泡 | agent 气泡 shadow-sm 消失；文案与断行不变 | F004 |
| KolCard ×3 | shadow-sm 消失（边框本已是 gray-200，颜色未变）；「YouTube · US · 1.3M 粉丝」等次要行灰度加深；徽标/标签/「频道」链接与匹配度 pill **完全一致** | F004 + 拍板 gray-600 |
| 协同交接卡 | 外框边框化；**卡内结构逐项一致**（A→B 头、分隔线、摘要、⚡交接物行）——此即"手抄克隆 → 真实组件"替换后的视觉等价证明；摘要第二行断行点位移一个汉字（"（受众吻/合" → "（受众/吻合"） | F004 + F003；断行位移见 OBS-2 说明 |
| 全页 | 内容整体下移约 2px | 边框增加 1px×2 的几何后果 |

**无发现：** 无区块删除、无语义替换、无字段/图标/链接目标变化、无文案变化（术语拍板除外）、无深浅色误切。

### 4.3 四张基线一致性

darwin 与 linux 两平台的变更条带、变更性质一一对应（仅字体栅格化差异导致像素数不同），说明 `--update-snapshots=all` 修复（`42d7d75`）后 linux 侧确实**全量改写**，未残留旧帧。

---

## 5. 观察项与建议

| # | 内容 | 严重度 | 处置建议 |
|---|---|---|---|
| OBS-1 | 预览页 `StaticHandoffCard` 包装函数与 `HandoffCollab` 的容器 chrome（SurfaceCard+SectionLabel+标签文案）逐字重复 | 低 | 不影响本批 acceptance；若日后改标签文案需两处同步，可入 backlog 作二次收敛 |
| OBS-2 | 边框 token 归一（gray-100→200、ExpertScope 四边边框）与随之的 ±2px 位移 / 一处摘要断行位移，未在 spec D2 拍板枚举中逐条列名 | 低 | 属 F004 acceptance 4.2 的必然结果且 commit 已声明，**建议 Planner 在 done 阶段追认入拍板记录**，使 D2 清单与实际基线一致 |
| OBS-3 | **视觉断言容忍带过宽**：`maxDiffPixelRatio: 0.02` ≈ 29,700px。实测本批 en-today 全部有意改动仅 **1.53%（darwin）/1.44%（linux）**——**低于容忍阈**。即：本批 today 页的全部视觉变更（含"协同交接卡整块出现/消失"这一 1.44% 量级事件）**不会**被 `test:visual` 判红。这与 F003「恢复视觉回归保护」、F007「消 CI 视觉盲区」的目标存在张力：盲区从"数据侧"（无 DB）移除了，但"断言灵敏度侧"仍有 ~2% 的静默带 | **中（建议入 backlog）** | 非本批 acceptance 覆盖项、且为 CICD-VPS F004 遗留配置，**不计 FAIL**。建议下批将阈值收紧（如 `maxDiffPixels: 1500` 或 ratio 0.001）并配 `--ignore-snapshots` 之外的抗抖动手段；与 `42d7d75` 修复的 `--update-snapshots=all` 属同源问题（"容忍内静默"） |
| OBS-4 | 发送按钮 disabled 不透明度 40%→50% 进入基线 | 低 | 属 F002 范围（A 路验收），此处仅作为基线 diff 归因记录，**不在 B 路计分** |

---

## 6. 结论

F003 / F004 / F007 三条 feature 的全部 acceptance clause 均以实物证据达成，**判定 PASS**。视觉证据链完整闭合：

`route mock 固定夹具（7.1/7.2）` → `F001-F005 后单次重生 4 张基线（7.3/7.4）` → `本地 2 passed + CI run 29772314482 对新 linux 基线 success（7.5/7.6）` → `4 张 PNG 逐张人查，变化可 100% 归因至拍板项或其必然副产品（7.7）`，且 linux 基线由"空白留白"变为"填充态交接卡"，直接证实 BL-FE-11 / BL-FE-02 的盲区已消除。

唯一需要决策者注意的是 **OBS-3**：本批把"看不见的东西"变成了"看得见"，但断言阈值仍允许同量级变化静默通过，建议作为下一批 backlog 条目处理。

---

*报告人：Andy/evaluator-subagent（隔离上下文）· 本报告未修改任何产品代码与状态机 JSON*
