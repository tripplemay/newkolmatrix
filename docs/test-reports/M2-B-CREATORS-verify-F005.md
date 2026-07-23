# M2-B-CREATORS F005 验收记录 — CreatorDrawer 七分区接真

- **署名：** Andy/evaluator-subagent（隔离上下文，fresh context）
- **日期：** 2026-07-23
- **阶段：** verifying（首轮）
- **结论：** **PASS**（acceptance 7 项逐条 PASS）
- **验收方式：** 代码实物逐行核对（drawer/格式化单点/契约层）+ 原型 L926-973 逐区对照 + dev DB 实测（只读）+ L1 实跑（lint/tsc/unit）+ CI 实物（visual job 日志）+ 基线截图目检。未起任何 :3000 server（端口纪律，test:visual 以 CI 实物为证）。

---

## 逐条判定

### 1. prop 换真 Kol 可序列化视图（展示串单点 lib/display/creator-format.ts）— PASS

- `CreatorDrawer.tsx:293-298`：prop 类型 `creator: CreatorView | null`（批前为 `MockCreator`，diff 实证 `f0bc05c..HEAD`）；导入源 `lib/display/creator-format`（:41-46），`lib/data/mock/creators` 引用已消失。
- `src/lib/creators/page-data.ts:148`：RSC 组装层 `listRows.map(kolToCreatorView)` → 纯数据对象（可序列化）；`CreatorsClient.tsx:324-326` 原样下传抽屉。
- 展示串单点：`creator-format.ts:19` 复用 `formatPlat/formatWan`（match-format 先例）；分级阈值常量导出 `CRED_GRADE_THRESHOLDS`（:152-157）。
- mock 残留：全仓 grep `mock/creators` 仅存 2 处历史注释（CreatorDrawer.tsx:40 / creator-format.ts:3），零代码消费。

### 2. 七分区逐区语义 — PASS（基线截图实拍逐项对上）

| 区 | 要求 | 实物 | 判定 |
|---|---|---|---|
| ① 受众画像 | interests 真值 + 分布三键「待接入」子降级 | interests Pill 流（:458-473，实拍 基线夹具/gaming/sandbox）；region :437-441 / age :449-455 / gender :475-485 逐子块「待接入 · …待受众分析源接入」；真实性 ring←credibility.score（实拍 93%）、活跃度 ring 待核 | PASS |
| ② 内容表现 | 「待接入」 | :557-560「待接入 · 平台 API 未接通，播放与互动数据暂缺」（实拍） | PASS |
| ③ 合作历史 | 空态真话 | :590「与我方暂无合作记录。」（实拍）+ 竞品待接入 + 响应/上次合作「—」 | PASS |
| ④ 商务档期 | 「待补充」 | :634-636 `PENDING_TEXT.fill`「待补充 · CRM 未录入商务信息」 | PASS |
| ⑤ 合规风险 | credibility 分级真值 + brandSafety「待接入」 | :667-672 品牌安全评分 = credGrade 真值（VK-FULL「A 级」）；#ad null → 待接入（:653），溯源对象校准为 brandSafety 契约位（creator-format.ts:143 注释在案） | PASS |
| ⑥ 内容样本 | 「待接入」 | :706-708「待接入 · 平台内容样本未同步」 | PASS |
| ⑦ 专家判断 | 匹配「待核」P5 | header Pill「受众匹配 待核」+ judge.match 含「待核——库级无项目上下文」（creator-format.ts:201,231-232 恒 null/文案）；reach/comp null → 按 Agent 域区分占位（:282-286） | PASS |

单测锚定：`tests/unit/creator-format.test.ts` 双态覆盖（interests 入 aud + 三键 null 子降级 / 全 null → aud null / 脏契约位不抛错 D2 / P5 match 恒 null）。

### 3. 布局零变更（V10 34 元素 🔒）— PASS

- 七分区 `title=` 行序（:389/499/564/616/643/679/713）= 原型 renderDrawer 分区序（受众画像→内容表现→合作历史→商务与档期→合规与风险→内容样本→专家 Agent 判断）逐一对照一致。
- dw-head（avatar52/名/small/关闭钮/badges×3/dw-summary 淡紫块）、地域 donut 118+中心叠加+legend、双 ring 64、dw-mini×3、趋势 h88、dw-deliver×3、dw-jc×3 主题彩条、dw-foot 两钮——结构全保持。
- 批内 diff（f0bc05c..HEAD，214 行）仅为：类型迁移（Mock→View）、可空降级分支包裹、5 处 provLabel 硬编码移除；无分区删改/顺序变动/结构简化。
- ProvenanceTag ×5 位点全保留（`provOf` ×5 实数）；null 不渲染徽标遵**既有** §7.5.2 读写不对称（drawer 头注释 :8-10 批前已在），非本批布局变更。

### 4. ProvenanceTag 接真（P4 归一消解验证）— PASS

- 5 处 mock 硬编码 provLabel 全移除（diff 摘录：`Apify 采集 · 3 天前…`/`平台 API · 实测`/`CRM · 历史成交`/`合规 Agent 核验`/`平台 · 近 30 天` 五行 `-`），改由 `resolveProvenance` 消费真 fieldProvenance。
- **DB 实测（dev，只读）：** dataSource 分布 = `crawl:1 + user_upload:2525`（全六档内）；`resolveProvenance(VK-FULL,'audienceDemo')` → `{source:'crawl',resolvedFrom:'field',detail:'由创作者标签规则派生（非受众实测分布）'}`；存量行 → `{source:'user_upload',resolvedFrom:'row'}`；**抽样 50 行 fallback(ai_estimate) 触发 = 0**（批前恒触发 bug 消解实证）。
- 基线截图实拍：受众画像区「Apify 采集 · 今天」badge 可见（crawl 派生标注）。

### 5. creator-drawer.spec 锚点重设计 — PASS

- `tests/visual/creator-drawer.spec.ts`：首行假设移除，改点固定夹具行（VK-FULL/VK-NULL，seed 固定 publicId `vk-visual-full-0001`/`vk-visual-null-0002`；锚点用夹具 displayName，followers 9.99M/9.98M 实测恒居库内前二 → LIST_LIMIT 内确定可点）。
- 双状态硬断言（§4.3）：VK-NULL 待接入态（「受众数据采集未完成」+「平台 API 未接通」waitFor）先验后 Esc 关闭；VK-FULL 真值态（`sandbox` pill +「可信度 A 级」waitFor）入基线截图。任一状态渲染缺失即超时硬红。

### 6. 基线对账重生 — PASS

- `creator-drawer-darwin.png` 于 bf8e507 重生（262023→244273B，重生序遵 §4.5）；`creator-drawer-linux.png` 于 d9ea2f1（Update visual baselines bot，261665→237019B）。
- 目检 darwin 基线：七分区实拍内容与接真意图逐处相符（见 §2/§4 实拍项）。

### 7. lint + tsc + test:unit + test:visual 绿 — PASS

- 本机实跑（prisma generate 前置）：`next lint` **0 err / 0 warn**；`tsc --noEmit` 干净；`vitest run` **356/356**（34 文件）。
- test:visual（端口纪律不本地重跑，CI 实物为证）：最新 main CI run **29983329091**（e95a7ff）Visual regression job **success「13 passed (28.5s)」**；`playwright test --list` 确认 13 用例含 `creator-drawer.spec.ts:26`。F005 commit（bf8e507）CI visual 红为 linux 基线未重生的预期红，d9ea2f1 重生后 F006/F007/F008 三连 CI 全绿（含 visual）。

---

## 产物纪律

- 未修改任何产品代码；验证脚本落 scratchpad（不入仓）。
- DB 验证全程只读，零写入，无需清理；2524 Kol + 2 视觉夹具基线态原样保留（D-H）。

## 备注（非缺陷）

- acceptance 措辞「点固定 publicId 夹具行」：spec 实际以夹具 displayName 为点击锚（publicId 未做 DOM 暴露）；displayName 为夹具专属且确定，替代首行假设的意图完全满足。
- 视觉 spec 未对「Apify 采集」badge 文本单独 waitFor（由基线截图编码 + 1500px 阈值守护）；acceptance 要求为「标注可见」，实拍满足。
