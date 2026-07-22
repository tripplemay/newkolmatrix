# M1-D-KNOWLEDGE Signoff 2026-07-22

> 状态：**已签收（首轮验收全 PASS，可置 done）**
> 触发：M1-D 批次 fan-out 首轮验收 **6/6 PASS**，无 FAIL/PARTIAL → 对抗复核零触发，**fix_rounds = 0**，直接签发批次收官报告
> 签收人：**Andy/evaluator-subagent**（隔离 fresh context；本报告为对 6 份分报告判定与证据的**机械合并**，不重新评估、不改写任何结论）

---

## 变更背景

M1-D 立起 knowledge 域完整纵切：素材上传（本地盘 docker 卷，U2）→ Material 落库 → AI 解析管道（文本 chat + 图片 vision，U3）→ GameKnowledge 三类 kind + supersede 链（P3，D20 变异测试）→ knowledge 页面接真 + mock 退役 → prompt ⑤层知识注入（U4）→ 部署面 materials 卷 + 文档 as-built 翻牌。这是 M1 官方清单的唯一剩余项（architecture.md:1798），M1-C F007 顺延而来。

- **Spec：** `docs/specs/M1-D-KNOWLEDGE-spec.md`（Spec lock 2026-07-22，U1-U4 用户裁决 + P1-P8 Planner 默认；开工审计 1 次：小图处置矛盾 → 裁决方案 A，`docs/specs/M1-D-KNOWLEDGE-f002-smallimage-adjudication.md`）
- **验收模式：** fan-out 隔离验收（6 features，orchestration §4，沿 M1-B/M1-C 模式）；无 PARTIAL/FAIL → 对抗复核与 fixing/reverifying 均未触发
- **验收对象：** main `ecde6cd`（完整 SHA `ecde6cdfabc7cae570ace4006d6af7a307457110`，工作树 clean）；六个 feature commit：`27aeec1` / `ba13696` / `2c0abd0` / `426ee0b` / `cdc08ac` / `ecde6cd`

---

## 判定总览

| Feature | 标题 | 首轮 | 对抗复核 | 复验 | 最终 |
|---|---|---|---|---|---|
| F001 | schema：Material + GameKnowledge 两表 + zod 契约 | PASS | —（未触发） | — | **PASS** |
| F002 | 存储通道 + 上传 API（本地盘卷，U2） | PASS | —（未触发） | — | **PASS** |
| F003 | 解析管道（文本 chat + 图片 vision）+ 状态机变异测试 | PASS | —（未触发） | — | **PASS** |
| F004 | knowledge 页面接真 + mock 退役 | PASS | —（未触发） | — | **PASS** |
| F005 | prompt ⑤层知识注入（U4） | PASS | —（未触发） | — | **PASS** |
| F006 | 部署面：materials 卷 + env + 文档 | PASS | —（未触发） | — | **PASS** |

**首轮 6/6 PASS · fix_rounds = 0 · 对抗复核零触发（无 FAIL/PARTIAL）。**

---

## 逐 feature 判定与依据（证据文件为判定唯一来源）

| Feature | 判定 | 一句话依据 | 证据文件 |
|---|---|---|---|
| F001 | **PASS** | 两表在库（`\d` 实证）+ 三枚举 DB/schema/zod 三方逐字一致 + migration 纯 expand 已应用 + zod 宽松降级 18/18 + Evaluator 独立对抗探针 9/9 + 四件套同 commit + L1 全绿（tsc 0 / lint 0/0 / unit 224/224） | `M1-D-KNOWLEDGE-verify/F001-round1.md` |
| F002 | **PASS** | 上传落盘落库 21/21 复跑全绿 + 双层路径穿越防护对抗实测 A1-A5 无逃逸 + 小图裁决精确边界 10px 拒 / 11px 放行 + route 层真实限流第 11 发 429 + Retry-After + DTO 不泄露 storageRef（Evaluator 独立对抗 19/19） | `M1-D-KNOWLEDGE-verify/F002-round1.md` |
| F003 | **PASS** | 四态流转 + supersede 同事务链真数据实证（text×3 全 superseded、image×3 全 HEAD）+ D20 变异测试活性实证 3/3 击杀（隔离 worktree）+ 链头读取全仓零绕过 + L2 真网关 chat/vision 双路径均 parsed 且三类 kind 齐 | `M1-D-KNOWLEDGE-verify/F003-round1.md` |
| F004 | **PASS** | RSC 直读改→验→复原实证（探针链头即插即现、链头口径页面层成立）+ force-dynamic + prerender-manifest 0 命中 + mock needle 全仓 grep 零残留 + 浏览器 6 探针全绿（含 L2 上传→自动解析→轮询→刷新全链）+ 两视口 + visual 13/13 + 基线重生 CI 闭环 | `M1-D-KNOWLEDGE-verify/F004-round1.md` |
| F005 | **PASS** | knowledgeKinds 四人格映射 grep + 实读逐点核销 + 单测 8/8 + 集成（真库）4/4（三口径等价 / kinds 过滤 / 链头恒取 / 缺失空串不注水）+ L2 真对话虚构标记词 8/8 命中（回复只能来自 ⑤层注入链路） | `M1-D-KNOWLEDGE-verify/F005-round1.md` |
| F006 | **PASS** | compose 卷/env `docker compose config` 渲染实证 + .env.example/.gitignore 落终态 + deploy.md R7 记账 + architecture/agent-architecture as-built 翻牌逐条实物交叉验证 + 探针漂移扫描 0 受损（检测器活性 17 处他域命中证明）+ lint/tsc 绿；「部署验证随上线执行」为 acceptance 自身声明的延后项，不计入本轮 | `M1-D-KNOWLEDGE-verify/F006-round1.md` |

---

## 就绪回归对照（spec §5）

| §5 项 | 覆盖情况 |
|---|---|
| lint + tsc + test:unit 全绿 | 已证——F001/F002/F003/F005 四个分片在批次 HEAD `ecde6cd` 各自独立复跑：tsc exit 0 · lint 0 warn 0 err · unit **20 files / 224 tests 全绿**（四次独立运行结论一致） |
| test:visual 全绿 | 已证——F004 分片本机 **13/13 passed**（含 knowledge visual baseline，对 426ee0b 重生基线）；CI 侧 F005/F006 推送 CI success（含 visual job）闭环 |
| CI 收官态 | `ecde6cd` CI success + Build & Push image success（gh run list 实证）；批内唯一一次 CI 红 = `426ee0b` visual（linux 基线未重生，spec §4.4 预期红，update-visual-baselines workflow `7f213b4` 重生后闭环） |
| 三条 p2 探针 + f008/f010 无回归 | **无独立分片证据**——本批 fan-out 为 6 feature 分片（无 M1-C 式 READINESS 分片），六份证据文件均无 p2:f001/f002/f004、f008:browser、f010:e2e 运行记录。列入观察项 OBS-6，供 done 阶段 Planner 裁决是否补跑（汇总层如实记账，不改写任何分片判定） |

---

## L2 真网关用量汇总（已授权，最小素材；从证据文件抄录）

| 来源 | 调用 | 模型 | tokens（in / out / total） | 估算成本 |
|---|---|---|---|---|
| F003 | chat（文本路径，406B md 素材） | deepseek-v3 | 342 / 123 / 465 | ≈$0.000136 |
| F003 | vision（图片路径，480×320 PNG 14.6KB） | qwen3.5-flash | 389 / 667 / 1056 | ≈$0.000199 |
| F004 | S4 run1（页面全链，172B 中文 txt） | deepseek-v3 | 309 / 93 / 402 | ≈$0.000116 |
| F004 | S4 run2（修正 locator 后完整链路） | deepseek-v3 | 309 / 94 / 403 | ≈$0.000116 |
| F005 | 真对话 1 次 chat（strategy 人格 ⑤层注入实测） | deepseek-v3 | 流内无 usage 元数据；输入估 400–600 / 输出估 150–250（按字数估算） | <$0.0003 |

- **合计：5 次调用**（chat×4 + vision×1）。计量到 token 的 4 次共 **2326 tokens ≈ $0.000567**；F005 估算 <$0.0003；**批次总计 ≈ <$0.0009**。
- F001 / F002 / F006 零网关用量（分别为纯本地实证 / 纯本地 IO+DB / 只读配置文档验收，授权未消耗）。
- pdf 分支用 mock LLM 注入验证，零网关成本（F003 §1）。

---

## 遗留观察项清单（从证据文件原样抄录，均不阻断）

| ID | 来源 | 内容 | 风险 |
|---|---|---|---|
| OBS-1 | F003 §6 | **AI SDK 弃用告警**：vision 调用触发 `DeprecationWarning: "image" content part type is deprecated. Use a "file" part with mediaType`（`parse.ts:94-97` 用 `type:'image'`）。当前 ai@7.0.31 运行正常、lint/tsc 绿，不违反 acceptance；建议后续批次顺手迁移 `type:'file'` 写法，防 SDK 升级破坏 | low |
| OBS-2 | F006 §6 | **VPS compose 人工副本硬前置**：deploy.md 新增的「compose 人工副本」⚠️ 前置对本批上线是**硬前置**（materials 卷缺失属静默持久化缺口，不报错——上传文件落容器层，容器重建即丢）；建议 deploy-prod 执行清单把「先拷新 compose 到 VPS」列为第 0 步。Generator 已在 `framework/proposed-learnings.md` 挂对应条目待用户裁决 | medium（上线前置，见放行意见） |
| OBS-3 | F004 §6 | 首轮 S4 失败为**探针脚本自身** locator 严格模式误报（toast 文案含文件名与素材行双命中），非产品缺陷；修正后复跑全绿。产品代码零改动（src/ prisma/ 配置全程只读） | low |
| OBS-4 | F001 §3 备注 | 计数口径：commit message 称「15 案例」，vitest 运行态 18 案例——差异源于 `it.each` 8 行展开计数口径，实测 ≥ 声称，非缺陷 | low |
| OBS-5 | F002 §4 / F003 §5 / F005 §4 | fan-out 并行窗口互见夹具：F002 测毕复核时见 GameKnowledge 3 行（归属并行 F003/F005 验收流）——已由属主流自清，F003 §5 与 F005 §4 终态均实证 `Material=0 | GameKnowledge=0 | Game=4`（视觉基线态），无交叉污染 | low（已闭环） |
| OBS-6 | 本 signoff 汇总核对 | spec §5 就绪回归的「三条 p2 探针 + f008/f010 无回归」项无独立分片证据（见上表）；L1 四件套 + CI 已在批次 HEAD 全绿。供 done 阶段 Planner 裁决：补跑一轮探针，或按批次触碰面评估后记账豁免 | low |

---

## Ops 副作用记录

本批次**无 prod/staging 数据库 ops**。dev DB 夹具全部按「改→验→立即恢复」闭环并有终态核验：

- F001 探针走 BEGIN…ROLLBACK 零残留；F002 对抗脚本自清 11 行 Material + 夹具 Game；F003 夹具全删 + 变异 worktree remove + 临时素材目录 rm；F004 探针行 DELETE 归零 + `.materials/` 删除 + standalone 进程杀净；F005 停服 + DELETE 3 条知识行 + PendingAction/OperationLog 零副作用行；F006 全程只读。
- 六流终态一致实证：**Material=0 · GameKnowledge=0 · Game=4 canonical（game-aw/lc/mf/xg）** = 视觉基线态干净。
- 端口纪律：127.0.0.1:3000 由 F004 验收流独占（测毕释放）；F005 起 :3101（31xx 段）；其余流未绑端口。

---

## Harness 说明

本批经完整状态机流程交付：planning（spec lock + 6 features）→ building（6/6 独立 commit，逐推 CI 绿；F004 visual 首推红为 §4.4 预期，baseline workflow 重生闭环）→ verifying（fan-out 6 分片隔离验收，**6/6 PASS，无 PARTIAL/FAIL，对抗复核零触发**）→ 本 signoff（**fix_rounds = 0**，fixing/reverifying 未进入）。所有判定由隔离 evaluator subagent 直接落盘，本报告为机械合并，无任何改写。快车道（lane=fast），验收产物署名 Andy/evaluator-subagent。

---

## 上线放行意见

**放行：同意置 done。** 生产部署为用户闸门（workflow_dispatch 手动触发），执行顺序与验证项如下：

### 部署前置（硬性，顺序执行）

1. **第 0 步：先同步 `docker-compose.prod.yml` 到 VPS** `/opt/apps/newkolmatrix/`——VPS 上的 compose 为人工副本，deploy-prod 不自动同步；跳过此步 = materials 卷缺失，上传文件落容器层，容器重建即丢（**静默缺口，不报错**）（F006 #10 + OBS-2）
2. 手动触发 deploy-prod workflow，**image_tag 用完整 40 位 SHA：`ecde6cdfabc7cae570ace4006d6af7a307457110`**（批次 HEAD `ecde6cd`，CI + Build & Push image 双 success 实证）

### 部署后验证项（**部署验证随上线执行——F006 acceptance 延后项**）

| # | 验证项 | 预期 |
|---|---|---|
| 1 | `/api/health` | 200 |
| 2 | `/admin/knowledge` 页 SSR | 4 canonical Game 渲染 + 零素材空态文案（「上传素材开始分析」/「待解析」）正常 |
| 3 | materials 卷挂载确认 | 容器内 `/app/materials` 存在且挂载至 `newkolmatrix-materials` named volume（`docker inspect` 或容器内 `df`/`mount` 核对）；可选：上传一份最小素材确认落卷而非容器层 |

另请留意 M1-C signoff Soft-watch S4（prod 例程首跑观察）仍在跟进窗口内。

---

**签收人：Andy/evaluator-subagent · 2026-07-22**

---

## 就绪回归补账（OBS-6 处置，Planner 裁决=补跑）

> 执行：**Andy/evaluator-subagent**（隔离 fresh context，2026-07-22，done 阶段后补账）。本段只追加，不改写上文任何既有内容与判定。
> 被测对象：本机 standalone 产物（BUILD_ID `_TbX74kSZwV-WIX-5Bmav`，经 `node --env-file=.env scripts/serve-standalone.mjs` 起 127.0.0.1:3000，testing-env-patterns §7）。HEAD `ff3ba1b` 工作树 clean；`git diff ecde6cd..ff3ba1b -- src/ prisma/ package.json ...` = **0 文件**（仅状态/报告/记忆 commit）→ 被测产物与批次 HEAD `ecde6cd` 产品面等价。dev DB = `newkolmatrix-dev-db`（healthy）。

### 六条探针结论

| # | 命令 | 结论 | 关键输出行 |
|---|---|---|---|
| 1 | `npm run p2:f001` | **PASS** | `=== F001 关闭路径：12 passed, 0 failed ===`（桌面 1440×900 + 移动 390×844 双视口，A-E 全绿） |
| 2 | `npm run p2:f002` | **PASS** | `=== F002 深色持久化：14 passed, 0 failed ===`（含 F pre-paint 活性三连断言） |
| 3 | `npm run p2:f004` | **PASS** | `=== F004 HandoffPanel：15 passed, 0 failed ===`（生产/夹具容器 class 逐字相同） |
| 4 | `npm run f007:browser` | **FAIL（原样跑；既有测试债 M1-C SW-R1，非 M1-D 回归——溯源见下）** | 2✗（`:34`「多 Agent 编队」/ `:36`「隔离」）后 `:40` `locator('aside input[placeholder*="说"]').fill` 30s TimeoutError 崩溃 |
| 5 | `npm run f008:browser` | **PASS** | `[f008-browser] PASS 12 / FAIL 0`（零待办态；侧栏 6 项 / 重定向 / 五环节 / console 0 error） |
| 6 | `npm run f010:e2e` | **PASS** | `[f010-e2e] 结果：6 通过 / 0 失败`（seed:demo-handoff 幂等跳过「已存在」；Part A NL→流式 loop→search_kols→**4 张 KOL 卡片**；Part B 人格切换；Part C handoff 可视化；console 0 error） |

### f007 FAIL 的非回归溯源（判定不软化，归因有实证）

- **失败签名与 M1-C READINESS §7.1 逐字相同**（同 2✗ 锚点 + 同 `:40 input.fill` 崩溃点）——即 M1-C Soft-watch **SW-R1** 记录的 5 处陈旧锚点测试债（漂移引入批次 = FE-REFACTOR / ARCH-M05，均先于 M1-C）。
- **M1-D 零触碰 copilot**：`git diff 8438dab..HEAD -- src/components/copilot/` 与 `git diff ecde6cd..HEAD -- src/components/copilot/` 均为**空** → 失败签名批前批后一致，非本批引入。
- **守护面无回归实证**：SW-R1 兜底③替代探针 `scripts/test/m1c-readiness-f007-l1-substitute.mjs` 本次复跑 **10/10 全绿**（面板常驻 / 专家头 / 多人格切换 / demo handoff 200 可展开 / console 0 error）。
- **f007 的 [L2] 发消息面由 f010 覆盖**：f007 崩在发消息之前（零网关消耗）；同一 `/api/agent → search_kols → KOL 卡片流` 链路由 f010 Part A 以现行锚点实测 PASS。
- 处置建议（沿 M1-C SW-R1 兜底①，仍挂起）：下批对 f007 探针做「修缮 vs 退役」裁决——本次补跑再次实证其原样不可绿，锚点校准清单在 M1-C READINESS §7.1，现行锚点已固化于替代探针可直接搬用。

### 回归结论

**六条探针覆盖面内无 M1-D 回归。** 5 条 PASS；唯一 FAIL（f007 原样跑）为先于 M1-C 的既有测试债 SW-R1，失败签名、git 溯源、守护面替代探针三方一致证明与 M1-D 无关。

### L2 用量（已授权最小用量）

- **f010 Part A：1 条真网关对话**（用户消息「帮我从创作者库找《坦克世界》题材的游戏解说 KOL 候选」→ agent loop 含 search_kols 工具往返，约 2 次 chat 请求，deepseek-v3）。流内无 usage 元数据（与上文 F005 同口径），按消息与上下文体量估算 **<2000 tokens ≈ <$0.0005**。
- 其余五条零网关：p2×3 只读断言；f008 无对话步；f007 崩溃于发消息之前（0 调用）；替代探针为纯 L1。

### DB 复原前后计数（终态复核）

| 表 | 测前基线 | 测后 | 终态（服务杀净后） |
|---|---|---|---|
| Material | 0 | 0 | **0** |
| GameKnowledge | 0 | 0 | **0** |
| PendingAction | 0 | 0 | **0** |
| OperationLog | 0 | 0 | **0** |
| Handoff | 1 | 1 | **1**（同一行 id `cmrsw008l00009y0984ad4qbn` = demo handoff，测前已存在同款 → 按任务口径保持测前数量，seed 幂等未新增） |

- 参照面不变：Game=4 canonical / Project=4 / Kol=2524。**探针全程零 DB 增量**（agent 对话为只读工具链路），无需删除性复原；行 ID 快照留存 scratchpad 备查。
- Ops 清理：standalone 服务（:3000）测毕 SIGTERM 杀净，`lsof` 实证端口释放、无 serve-standalone 残留进程；例程调度（health-scan @ 02:00）在服务存活窗口内未触发（OperationLog=0 佐证）。工作树 clean，零产品代码改动，零 git 操作（本段落盘后由编排者提交）。

**补账执行人：Andy/evaluator-subagent · 2026-07-22**
