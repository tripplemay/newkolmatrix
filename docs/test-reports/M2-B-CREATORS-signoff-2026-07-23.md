# M2-B-CREATORS 验收 Signoff（2026-07-23，fix_rounds=1）

> **验收形态：** 首轮 fan-out（9 隔离 evaluator + 4 对抗复核全 UPHELD）→ 5 PASS + 4 PARTIAL →
> fixing（四条修复）→ 复验 fan-out（4 隔离 evaluator，全 PASS 零复核触发）。
> 本文件为**机械汇总**：结论逐字取自 subagent 结构化返回与其独立分报告，主上下文未改写任何判定。
> **署名：** Andy/evaluator-subagent

## 结果总览

| # | Feature | 首轮 | 复验 | 分报告 |
|---|---|---|---|---|
| F001 | apify-kol client + zod 契约（真样本 pin）+ env | PARTIAL | PASS | verify-F001.md + reverify-F001.md |
| F002 | 深字段派生纯函数 + kol-deep zod 契约 | PARTIAL | PASS | verify-F002.md + reverify-F002.md |
| F003 | kol-sync 同步服务 + dataSource 归一 + 例程注册 | PASS | —（首轮 PASS 免复验） | verify-F003.md |
| F004 | creators 页接真 + mock 退役 + CI 视觉夹具 | PARTIAL | PASS | verify-F004.md + reverify-F004.md |
| F005 | CreatorDrawer 七分区接真 | PASS | —（首轮 PASS 免复验） | verify-F005.md |
| F006 | MatchCandidate 裁定写入口（U3 布局变更） | PASS | —（首轮 PASS 免复验） | verify-F006.md |
| F007 | 评分升级端到端验证 | PASS | —（首轮 PASS 免复验） | verify-F007.md |
| F008 | 部署面 + 文档翻牌 | PASS | —（首轮 PASS 免复验） | verify-F008.md |
| READINESS | 批次级就绪回归 | PARTIAL | PASS | verify-READINESS.md + reverify-READINESS.md |

**终判：9/9 PASS · fix_rounds=1 · status → done**

## 首轮 PARTIAL → 修复 → 复验闭环（复验结论原文）

### F001 — 复验 PASS

**结论：** 首轮 PARTIAL 指向面全部消失：(1) fixture 补齐 X 平台真样本 2 行（id=71723 Korianax87 / id=45107 HBST_DigiNeko），L2 真服务 DB 直查证实存量 X 恰 2 行且与 fixture 十字段逐字段一致（真样本 pin 兑现，CI 回归保护缺口闭合）；(2) fixture note 已据实对齐（四平台 + fix_round 1 溯源）；(3) 测试标题「四平台」现有硬断言背书（平台集合 sorted-set 相等断言，模拟去 X 判红——断言活性已证明）；(4) 首轮次要注记 x-api-key header 未真断言一并闭合（new Headers(init?.headers) 捕获产品 client 本体 init.headers 路径，断言 === 注入 key）。无新回归：修复零触碰 src/lib/apify/*，358/358 tests 绿（首轮 356→+2），tsc/lint 干净，fixture 唯一运行时消费方即 F001 测试文件。附带发现（非缺陷）：GET /kol/:platform/:userId 详情端点对 platform=x 同样 500（invalid_enum_value），与首轮列表过滤 500 同源，再实证 P2 绕行设计必要性。

**证据：** L1：tsc exit 0 / next lint 0 errors 0 warnings / vitest run 358 passed (34 files)，apify-client.test.ts 10/10。实物：fix commit 7cebb52 stat 显示 F001 面仅动 tests/fixtures + tests/unit（产品代码零变更）；client.ts:79-81 header 经 init.headers 传入与测试捕获路径一致。真实性三重实证：① id=45107/x/HBST_DigiNeko 与首轮 L2 独立记录三元组一致；② snowflake 时间戳自洽 Δ=0.8s/11.9s；③ L2 DB 直查 apify_kol.kols WHERE platform='x' 返回恰 2 行，id/username/displayName/platformUserId/followers/following/postsCount/location/joinedDate/verified 十字段与 fixture 逐字段一致；脱敏同规（DB 联系方式族本空=fixture 空数组真值，raw 1627/1312 字节已剥离为 _sanitized）。L2 用量：HTTP 只读 ×3 + ssh 只读（key/docker ps/psql SELECT ×6），零写入零上游花费零 TikHub 零投喂；隧道已拆、探针文件已清、密钥未落盘；:3000 全程未触碰、产品 dev DB 零读写。

### F002 — 复验 PASS

**结论：** 首轮 PARTIAL 三条指向面全部消失：(1) deriveCredibility followers 因子已实装（derive.ts:132-140，log10 归一 FOLLOWERS_LOG_CAP=7 封顶、权重 0.1、signal 人话依据）；(2) P8 hasBusinessEmail 信号已实装（derive.ts:141-147，权重 0.05，true/false 双向 signal，上游契约 apify/schemas.ts:34 在场且不落明细列）；(3) 头注释 derive.ts:10 已改五因子明文与实现一致，自相矛盾消解。CREDIBILITY_WEIGHTS 五因子重归一和=1（键集断言+toBeCloseTo 双守门）；回归 pin（followers-only 行）已永久化入 kol-deep.test.ts:146。无新回归：三因子既有行为保持（93 分值与首轮一致）、缺席重归一化语义保持、全缺→null、refine 防线、溯源互操作、kol-sync 集成真库落库断言（r2 followers-only → derivedCredibility=3）全部绿。两条 soft-watch 不阻断（建议下批 1 行顺手清理）：OBS-A derive.ts:195 provenance detail 文本仍列三因子枚举未随五因子更新（「明示派生」核心判据仍满足，所列无一错误仅不全）；OBS-B kol-deep.test.ts:184/:197 注释引旧权重数学式（断言值恰不变，纯注释瑕疵）。

**证据：** 实物取证：src/lib/kol-sync/derive.ts 修复后逐行（五因子 :107-147、FOLLOWERS_LOG_CAP=7 :83、权重 {verified:0.3,quality:0.3,tier:0.25,followers:0.1,businessEmail:0.05} 和=1 :69-80、头注释 :10 五因子对齐）；fix commit 7cebb52 diff 触及面核对（F002 相关仅 derive.ts + kol-deep.test.ts + kol-sync.test.ts，无越界产品改动）；L1 实跑 tsc exit 0 / lint 0 warnings / test:unit 358/358；复验探针 12 例实跑全过（RP-1 首轮 probe-4 逐字复现非 null / RP-2 hasBusinessEmail 双向 / RP-3 权重和 / RP-4 三因子无回归 93 / RP-5 followers 边界 0·10^9·负数 / RP-6 refine 未松动+fieldProvenanceEntrySchema 互操作）；kol-sync 集成真库 23/23（52ms DB 操作实证非跳过）；dev DB 清态基线吻合零残留；零 L2 项（P1 apify-kol/TikHub 零触碰）；未起 :3000。不采信 commit message / session_notes 叙述。

### F004 — 复验 PASS

**结论：** 复验 PASS（fix_rounds=1）。首轮 PARTIAL 两处指向面全部消失：(1) src/lib/data/mock/index.ts:17 creators.ts 行已翻牌为「~~creators.ts~~ | F013 | 已退役（M2-B F004/F005：创作者库+抽屉 RSC 接真，视图契约迁 lib/display/creator-format.ts）」，与 today/projects/env-match/knowledge 四行退役标注同构，末次触碰 = 本批 fix commit 7cebb52；(2) docs/specs/ARCH-M05-ui-inventory.md V9 已登记 spec §3 P10 截断提示行（L86），标题 16→17 元素（M2-B F004 布局变更小注 +1），登记内容与 spec §3 P10 原文及实装（page-data.ts LIST_LIMIT=100 followers 降序 / CreatorsClient.tsx:307 条件渲染 + 逐字文案）三方对齐。无新回归：fix commit F004 范围仅 2 文档文件零产品代码；lint 0 warn + tsc 静默 + 358 tests 全绿；F004 数据层直调脚本重跑全断言 ✅（基线态 2526 + 夹具锚点 + P5/KPI/截断/sentinel 改验复原，D-H 清态）；CI HEAD 7cebb52 五 job 全 success 含 Visual regression；夹具 credibility 硬编码，与 F002 五因子改动结构性隔离。

**证据：** fix commit 7cebb52 diff 实物：ui-inventory 2 行（V9 16→17 元素 + 截断提示行 + P5/接真语义登记）+ mock/index.ts 1 行（表格行翻牌，文件仍 export {} 无运行时变化）。登记 vs 实物一致：page-data.ts:17 LIST_LIMIT=100 / :131 take LIST_LIMIT+1 followers 降序；CreatorsClient.tsx:307-309 {listTruncated && ...} + 「按粉丝量显示前 {rows.length} 位（库内共 {totalCount}…」与登记「按粉丝量显示前 N 位（库内共 M 位）…」逐字对齐。本地实跑：next lint ✔ 0 warnings、tsc 零输出、vitest 34 文件 358 测试全绿（首轮 356，+2 属 F001/F002/F006 修复面）。dev DB 直调重跑：2526（2524 CSV + VK-FULL/VK-NULL）、crawl:1/user_upload:2525、VK-FULL score 93→A、premium=1、P5 全行 null、rows=100 truncated=true、sentinel 2527→2526 复原。CI run 29988592828（HEAD 7cebb52）：Lint/Build/Visual regression/Typecheck/Unit+integration 五 job 全 success——干净容器 seed 夹具 + creators.png 基线比对绿。visual-kols.ts:47 credibility 硬编码 → F002 deriveCredibility 改动不影响锚点。产物纪律：未修改产品代码，未起 :3000，DB 清态。

### READINESS — 复验 PASS

**结论：** M2-B-CREATORS READINESS 复验（fix_rounds=1）：首轮 PARTIAL 唯一指向面——真凭据本地全量 test:unit 门 match-verdict.test.ts 断言 1 因 beforeAll 未建组触发 P2 lazy 真网关（P7 违反 + ~2/3 概率 5000ms 超时红）——经 7cebb52 建组守卫（tests/integration/match-verdict.test.ts:65-70，F007 score-upgrade 同款先例）修复后全部消失，无新回归。修复为纯测试文件级，产品代码 lazy/D2/P4 语义零变更；守卫调用的 buildMatchPlans 纯规则零网关引用，不引入新耦合。

**证据：** (1) 真凭据隔离 3 连绿：5/5 ×3，Duration 297/275/298ms（首轮同条件 3 跑 2 红、红跑 5.06s+）；(2) 网络层铁证（本轮加测计数假网关）：旧版 8fd275f 测试命中 2 次 POST /embeddings（lazy 真打网关，检测器活性证明），新版 0 次命中——P7 违反根治为确定性结论而非概率复跑；附带实证 vitest 4.1.10 默认 reporter 管道下不显示 console.warn，首轮的 D2 warn 不可作 stdout 判据；(3) 真凭据全量 test:unit 2 连跑：34 文件 358/358 绿 ×2（Duration 2.18s/1.94s 无网络等待；首轮 355/356，用例 356→358 净增无删减，match-verdict 5 断言在场）；(4) 伪网关对照绿 5/5 432ms；(5) 快门：lint 0 errors/0 warnings，tsc exit 0；(6) 纪律面：:3000 全程未起、真网关/apify-kol/TikHub 零调用零花费、DB 终态逐项=起跑基线（Kol 2526+2 夹具 dataSource 不变、Match 三表/PendingAction/OperationLog 全 0、测试租户 0）、探针文件即跑即删无工作树残留。

## Soft-watch（复验注记，不阻断，下批顺手清理）

- **OBS-A**：`derive.ts:195` provenance detail 文本仍列三因子枚举未随五因子更新（「明示派生」核心判据满足，所列无一错误仅不全）——1 行文案。
- **OBS-B**：`kol-deep.test.ts:184/:197` 注释引旧权重数学式（断言值恰不变，纯注释瑕疵）。

## 附注（机械记录）

- L2 用量全程记录：apify-kol 只读（首轮 93+6 请求 + 复验 DB 直查/隧道 ×3，零上游花费）；TikHub 零调用零投喂（P1 全程遵守）；f010 真对话 1 次 + embedding 最小。
- D-H 终态各轮一致：Kol 2526（2524 归一 user_upload + 2 视觉夹具）/ Match 三表/PendingAction/OperationLog 全 0。
- 就绪回归九门（复验轮）：lint/tsc/build/test:unit 358×2 连绿/test:visual 13/13/三 p2 探针/f007-L1 替代/f008:browser/f010:e2e 全绿；真凭据 flaky 根治有网络层计数铁证（旧版 2 次 POST /embeddings vs 新版 0 次）。
