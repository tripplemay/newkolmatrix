# M1-C-LIST-TODAY 验收分报告 — 批次级就绪回归（READINESS）

- **验收人：** Andy/evaluator-subagent（隔离 fresh context）
- **日期：** 2026-07-22
- **被验对象：** main HEAD `5a666a9`（产品树最后变更 = `9d4aaa4` F006；`git diff --name-only 9d4aaa4..5a666a9` = 仅 architecture.md/features.json/progress.json，standalone 构建覆盖全部产品代码）
- **口径：** spec §5 末行「就绪回归」：lint + tsc + test:unit + test:visual 全绿；三条 p2 探针 + f007:browser + f008:browser 无回归（f008 = 修缮后双态断言）；基线漂移逐张说明成因
- **判定：PASS**（1 条 soft-watch 见 §9，为先于本批的探针陈旧债，非 M1-C 回归）

---

## 0. 环境前置（testing-env-patterns 对照）

| 项 | 实测 | 结论 |
|---|---|---|
| `prisma generate` 先于 tsc（§3） | 已执行（本批 F002 有 schema 变更）后再跑 tsc | ✅ 排除 client 陈旧误报 |
| Node 版本 vs `.nvmrc`（§4） | 本机 v25.7.0；仓库无 `.nvmrc` | 无约束文件；全套件绿，无 jsdom/localStorage 误报征兆 |
| UI 实测走 standalone（§7） | `:3000` = PID 41879 `next-server (v15.5.20)` 起于 Jul 22 02:32；`.next/BUILD_ID` mtime 02:31 晚于 F006 commit 02:18 | ✅ 服务含全部 7 features 产品树的构建 |
| dev DB | 容器 `newkolmatrix-dev-db` Up (healthy)，`DATABASE_URL` per `.env` | ✅ |
| D-H 基线态（跑 visual 前核实） | `SELECT count(*)`：PendingAction=0 · OperationLog=0 · Project=4 | ✅ 前序 feature agent 无残留夹具 |
| canonical 项目行 | xg/lc/aw/mf 按 createdAt asc，名称与 mock 逐字一致 | ✅ 前序改→验→复原纪律有效 |

## 1. next lint — PASS

`✔ No ESLint warnings or errors`（0 errors / 0 warnings，无需走 warning 处理矩阵）。

## 2. tsc --noEmit — PASS

无输出，exit 0（prisma generate 之后执行）。

## 3. npm run test:unit — PASS

vitest v4.1.10：**12 文件 / 139 tests 全过**（Duration 462ms）。含本批新增：
`tests/integration/pending-action-columns.test.ts`（F002）、`tests/integration/health-scan-routine.test.ts`（F004：kind=auto + payload 形状 + 幂等 + 互斥锁）、`tests/unit/relative-time.test.ts`（F003）。集成测打真库且自清（跑后 OperationLog 仍 0 行，实测复核）。

## 4. npm run test:visual — PASS

Playwright **13/13 passed（23.0s）**，复用 :3000 standalone（`reuseExistingServer: !CI`）：agent-canvas / creator-drawer / dashboard-today（含 F003 新增雷达空态文案 waitFor 硬断言）/ campaigns / project-{brief,match,reach,delivery,insight} / creators / knowledge / insight / runs。跑前 D-H 零行态已核实（§0）。

**CI 旁证：** 产品树最后 commit `9d4aaa4` CI run success（gh 实查）——linux 侧对重生基线的视觉 job 同绿；`d222374`（F003）的一次 CI 红 = 基线重生前的预期红，随 `941bea7` workflow 重生后 `948d327/2289343/9d4aaa4` 三连绿。

## 5. 三条 p2 探针 — PASS

| 探针 | 结果 |
|---|---|
| `npm run p2:f001`（抽屉四关闭路径，桌面+移动） | **12 passed, 0 failed** |
| `npm run p2:f002`（深色持久化 + pre-paint，含 F-live/F-mut 变异对照活性自证） | **14 passed, 0 failed** |
| `npm run p2:f004`（HandoffPanel 生产/夹具同壳） | **15 passed, 0 failed** |

## 6. f008:browser（修缮后双态断言）— PASS，两态各 12/12 亲测

- **空态支（基线态 0 pending）：** 12/12，含「今天零待办 → 雷达空态可见文案」（§4.3 反静默空白锚）。
- **有待办支（本验收自造夹具）：** SQL 插入 1 行 PendingAction（id=`eval-readiness-fixture-1`，projectId=xg 的 cuid，agentId=`reach`，harmJson 合法 zod 形状）→ 复跑 12/12，断言翻至「今天待办直达（真实 anchor，`href=/admin/campaigns/xg?env=reach`）」——**agentId 经 STAGE_AGENT 反查环节深链在双态支内实证**。
- **D-H 复原：** 夹具即插即删，删后核实 PendingAction=0 · OperationLog=0 · Project=4（§0 同口径）。
- F001/F003 Link 化复活的 §4 列表卡 anchor（`a[href^="/admin/campaigns/"]` 点击进详情）与 §5 待办 anchor 断言均真实命中——D-G 修缮目标兑现。

## 7. f007:browser — 守护面无回归（探针本体陈旧，先于本批，见 SW-R1）

### 7.1 探针原样跑：不能绿（2✗ 后在 :40 `input.fill` 超时崩溃）

失败点逐条溯源（全部 git 实证，**无一由 M1-C 引入**）：

| 探针锚点（行号） | 现行实物 | 漂移引入批次 |
|---|---|---|
| `:34`「多 Agent 编队」 | 该串现仅存于 `/preview/agent-canvas`；admin aside S3 外壳无此标题 | ARCH-M05-F003 `2284333` |
| `:36`「隔离」 | 术语已统一为「职责/**边界**」（渲染文本无「隔离」，仅注释残留） | FE-REFACTOR-F001 `f7fc3cf` |
| `:39` `placeholder*="说"` | 现 placeholder =「问 Agent 或下达任务…」→ fill 超时崩溃 | ARCH-M05-F003 `2284333` |
| `:62`「协同交接」（reach 页） | 环节上下文标签 =「**本环节协同**」（HandoffPanel stage 三元文案） | ARCH-M05-F003 `2284333` |
| `:64` 展开钮 `:text("→")` | 分隔符现为「↔」（HandoffCard） | FE-REFACTOR-F003 系 |

**非回归证明（对基线可比）：** M1-B 生产 SHA `19af7f1` 处 `git show/grep` 实证：placeholder 已是「问 Agent…」、「多 Agent 编队」已仅存 preview、「隔离」已仅存注释；且 `git diff 19af7f1..HEAD -- src/components/copilot/` = **空**（M1-C 对 copilot 零触碰，仅 gate/orchestrator +11 行）→ 失败签名批前批后逐字相同。探针最后跑绿记录 = AGENT-FOUNDATION 2026-07-20（`AGENT-FOUNDATION-F008-verify` 10/10），此后 FE-REFACTOR/ARCH-M05 改文案未同步锚点，ARCH-M05-F007 `4719d9d` 仅改了 URL（?stage=→?env=）未校准文案锚，各批 readiness 均未再跑此探针。

### 7.2 结构性边界：f007 §2 = [L2]，未授权环境本就不可全绿

`:40-49` 发消息→`/api/agent`→网关真聊天调用（计费）。**即使锚点全新鲜，f007:browser 在未授权 L2 的环境也不可能 exit 0**——F005 分报告同口径（「f007/f010 全量含网关聊天 [L2]，未授权不执行」）。故本项按 evaluator 行为规范 L1/L2 分层处理：L1 面以替代探针实证，L2 面声明待授权。

### 7.3 L1 替代探针：守护面 10/10 全绿

新增 `scripts/test/m1c-readiness-f007-l1-substitute.mjs`（Evaluator 测试产物，现行文案锚，头部注明前置与陈旧点清单——跨隔离上下文的坑写进脚本本身）。复刻 f007 §1/§3/§4/§5 全部非网关断言：

```
✓ CopilotPanel aside 常驻渲染
✓ 输入框在场（placeholder=「问 Agent 或下达任务…」）
✓ 专家头(ExpertScope)=匹配 Agent（/creators→match）
✓ 专家头常驻显示 职责 + 边界
✓ 旧 id 深链 starlight-protocol?env=reach → 专家头切触达 Agent（多人格切换 + LEGACY_ID_ALIAS 兼容，F005 D-E 保留面）
✓ context 无残留 KOL 卡片
✓ 本环节协同区渲染（HandoffPanel 环节上下文标签）
✓ demo handoff（match→reach，DB 真行经 /api/handoffs 200）在场
✓ 交接可展开看 交接物（A↔B）
✓ console 无 error（0 条）
```

**结论：f007 守护面（面板常驻/专家头/多人格切换/旧 id 深链/协同交接/console 清洁）在 M1-C 后功能完好，无回归。**

## 8. 视觉基线漂移与成因核对 — PASS

### 8.1 本批基线 commit 全账（`git diff --stat d8fcd77..HEAD -- tests/screenshots/baseline/`）

净变更恰为 5 文件 = spec §1.1.6 预告的两张 × 两平台 + 1 张附带重拍：

| commit | 文件 | 成因（commit 正文逐张对账 + 本验收独立取证） |
|---|---|---|
| `7f86062`（F001） | campaigns-darwin.png | 数据级：health pill×4 变红（D2 全 cr）+ goal 句×4 换 D9 合成串；「重生前旧基线仍绿」= 无布局回归证明 |
| `11e67ba`（workflow 重生） | campaigns-linux.png + creator-drawer-linux（−6B）+ insight-linux（−1B） | campaigns 同上 linux 镜像；后两张为全量重拍附带字节噪声（阈值下不可见） |
| `d222374`（F003） | en-today-darwin.png | 数据/占位级：KPI 真值 + 雷达空态 + feed 空态 + 两卡「待接入」占位；重生前清零行（D-H）commit 正文在案 |
| `941bea7`（workflow 重生） | en-today-linux.png + creator-drawer-linux（−2B）+ insight-linux（+1B） | en-today 同上 linux 镜像；insight-linux 两次噪声净归零（批级 diff 不含它） |

### 8.2 独立像素取证（自制 canvas diff，通道差 >8 计差异像素，非复述 commit message）

| 图 | 尺寸 | diff 像素 | bbox | 判读 |
|---|---|---|---|---|
| campaigns-darwin old→new | 1512×982 不变 | 78,376 | x[343-1123] y[244-581] | 差异**全部封闭在内容列四张项目卡区**；顶栏(y<244)/侧栏(x<343)/Copilot aside(x>1123)/卡区下方逐像素稳定 → 纯数据级，无布局/字体回归 |
| en-today-darwin old→new | 1512×982 不变 | 197,473 | x[321-1123] y[173-981] | 差异全部在主内容列（KPI 行/雷达/feed/两占位卡），侧栏与 aside 逐像素稳定 → 数据+占位级（页面主体本就是接真面），无布局/字体回归 |

（diff 像素数大于 commit 正文引用值属度量差：playwright 用 YIQ 色距+默认阈值，本取证用通道差 >8 的更敏感口径，二者不矛盾；判读以「差异区域封闭性」为准。）

字体侧旁证：两图页面高度不变、侧栏/顶栏文字零 diff——若字体回归会全页扩散，实测无。

## 9. Soft-watch（供 signoff 引用，含明文兜底）

- **SW-R1｜f007:browser 探针锚点陈旧（测试债，非 M1-C 引入）：** 5 处锚点停留在 AGENT-FOUNDATION 时代文案（§7.1 清单），FE-REFACTOR/ARCH-M05 改文案后未同步，两批 readiness 均未跑它故未暴露。**兜底：** ①下批对 f007 做「修缮 vs 退役」裁决（对照本批 F006/D-G 先例；「多 Agent 编队」标题断言在现 S3 外壳已无对应物，需重定义而非改字）；②修缮前任何授权 L2 全量跑必先按 §7.1 清单校准锚点，现行锚点已固化在 `scripts/test/m1c-readiness-f007-l1-substitute.mjs` 可直接搬用；③守护面当前无回归已由替代探针 10/10 实证，不阻塞本批。
- **观察（不构成 soft-watch）：** demo Handoff 行 `projectId='demo-starlight-protocol'` 为 AGENT-FOUNDATION 时代软引用，不指向任何现 Project 行（canonical xg 为 cuid）；现唯一消费方 `/api/handoffs` 不按 project 过滤，无碍；M1-D 徽标/洞察接真若按 projectId 联查需留意。

## 10. 验收环境自证

- 本验收零产品代码改动（`git status` 无 tracked 文件修改）；新增测试产物仅 `scripts/test/m1c-readiness-f007-l1-substitute.mjs` 与本报告。
- 夹具纪律：1 行 PendingAction 即插即删（§6）；结束态 PendingAction=0 · OperationLog=0 · Project=4 · Handoff=1（demo，批前既有）。
- 共享 :3000 standalone 全程未重启。
