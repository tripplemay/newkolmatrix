# AGENT-FOUNDATION F008 验收报告（首轮 verifying）

- **Feature：** F008 — IA：侧栏 6 项（今天/项目/创作者库/游戏知识/洞察/Agent 记录）+ 项目空间是五环节的唯一容器
- **被验提交：** `dd85b6b`（feat）+ `d778e71`（building→verifying）
- **验收方式：** fresh-context 隔离 evaluator subagent；浏览器实测（Playwright chromium，next dev，viewport 1600px）+ 亲读代码 + 亲跑构建门
- **裁决落实核查：** 用户 2026-07-20 裁决侧栏按 **6 项（PRD §7 / 落地规范 §3 权威）** 实装，覆盖 spec §D21 的 4 项——features.json acceptance 已回填 6 项，本轮按 6 项验收
- **日期：** 2026-07-20
- **验收人：** Andy / evaluator-subagent
- **总判定：** ✅ **PASS**（9/9 acceptance 子条 + 构建门 + F007 无回归全绿，首轮 fix_rounds=0）

---

## 逐条 acceptance

### C1 侧栏恰 6 项 + 路由 today/campaigns/creators/knowledge/insight/runs — PASS
独立浏览器取样（`a[href="/admin/{path}"]` 精确锚点，非全 body 文本）：6 项齐全且文本正确——今天(/today) / 项目(/campaigns) / 创作者库(/creators) / 游戏知识(/knowledge) / 洞察(/insight) / Agent 记录(/runs)。routes.tsx 顺序 + 图标（MdOutlineToday/MdCampaign/MdPersonSearch/MdVideogameAsset/MdInsights/MdHistory）与 PRD §7（line 117）+ 落地规范 §3（line 50-58）逐项吻合。裁决落实：6 项非 4 项。

### C2 五环节只在项目详情空间内部（D22），无跨项目环节顶级入口 — PASS
- 侧栏独立取样：无 `/admin/brief|match|reach|delivery` 顶级入口，无旧路由 discovery/database/outreach/dashboards 残留（命中：无）。
- 无环节顶级路由目录（`ls src/app/admin` 无 brief/match/reach/delivery；insight 是侧栏「洞察」跨项目落地页，非项目内 Insight 环节）。
- 五环节仅在 `/admin/campaigns/[id]` 内以页内 tab 存在：切 Reach tab 后 pathname 不变（`/admin/campaigns/starlight-protocol`），仅 `?stage=reach` 变化——证明是页内 tab 非路由（D22）。

### C3 stagePanel 是环节唯一渲染入口 — PASS
- 代码：`StagePanel` 仅被 `ProjectDetail` 引用（grep 全仓唯一 import），`ProjectDetail` 仅在 `/admin/campaigns/[id]` 渲染；grep 确认无其他组件直接渲染五环节内容。
- 浏览器：切 Reach → StagePanel 渲染「本环节专家职责」+「环节工作台」占位，环节经此单一组件渲染。

### C4 今天(驾驶舱)待办直达「某项目的某环节」（复用 F006 routeToStage） — PASS
- 代码：`today/page.tsx` 用 `routeToStage(projectId, stage)` 生成 href（复用 F006/stage-routing 纯函数）。
- 浏览器：3 条待办直达链接均形如 `/admin/campaigns/{id}?stage={brief|match|reach|delivery|insight}`（starlight-protocol?stage=reach / nebula-drift?stage=match / iron-vanguard?stage=insight）；点击真正落到该项目该环节，Copilot 切到该环节专家。

### C5 各路由真实占位页无死链（含修 /admin/dashboards 404） — PASS
- 6 侧栏路由浏览器实测均渲染真实页无可见 404（用 `text=This page could not be found` 可见性判定，非宽泛 '404' 子串——已核实该字符串在每页 RSC payload 会假阳性）；creators/knowledge/insight/runs=ComingSoon 真实占位，today/campaigns/campaigns[id]=功能页。
- 重定向无死链：/admin→today，/admin/dashboards→today，/admin/dashboards/default→today，/admin/discovery→creators，/admin/database→creators，/admin/outreach→campaigns，全部落点正确且无可见 404。
- **独立单验 /admin/dashboards：** 落 `/admin/today` 且可见 404=0——F007 evaluator 记录的遗留 404 死链本批已修。

### C6 无角色切换器、无路由层权限守卫 — PASS
- 无角色切换器：UI 全 body 无「切换角色/角色切换/role-switch」文案；navbar/sidebar grep 无角色切换控件。
- 无路由层权限守卫：全仓无 `middleware.ts`；next.config 无 redirects/rewrites/headers 守卫（重定向是页级 `redirect()` 导航便利，非权限门）；grep 无 role/permission guard（仅 Horizon vendor `tableDataManagement.ts` 静态 demo「permissions」字符串，与 IA 路由无关；gateway 的 middleware 是 LLM middleware）。

### C7 console 无 error + 忠实 Horizon 视觉 — PASS
- console：跨 today/6 路由/重定向/项目列表+详情+tab 切换/待办点击全程实测 0 条 error。
- 忠实 Horizon：F008 页用 Horizon `Card`/`Button`/brand-500 紫 `#422AFB`/DM Sans/圆角/浅色默认；结构性 IA 批（占位页 + 导航），无 design-draft 像素页被替换/简化（重型 design-draft 页 Copilot 属 F007 已验）。

### C8 F007 无回归（新 IA 下对话面/canvas/多人格切换仍工作） — PASS
`npm run f007:browser` 10/10：CopilotPanel 常驻 + 专家头 duty+护栏 + 发消息 canvas 渲染真实 seed KOL 卡片流 + 多人格 match↔reach 可见切换 + context key 变化对话清空 + 协同交接区 A→B 可展开 + 浅色 console 0 error。

### C9 构建门（spec §6，删 tsbuildinfo + prisma generate 后） — PASS
- `tsc --noEmit` 退出码 0
- `next lint` 退出码 0（✔ No ESLint warnings or errors）
- `next build` 退出码 0（✓ Compiled successfully in 6.2s + ✓ Generating static pages 18/18）；路由表含 6 侧栏路由 + /admin/campaigns/[id]（ƒ Dynamic）+ 重定向页（静态）。

---

## 交叉验证（三套证据一致）
- 独立 Evaluator Playwright 脚本：**16/16 PASS**（自写，独立选择器，不复用 Generator 脚本）
- Generator `npm run f008:browser`：**12/12 PASS**
- Generator `npm run f007:browser`：**10/10 PASS**（F007 无回归）
- `npm run orch:smoke`：全绿（routeToStage 断言更新到 /admin/campaigns/[id]）

## 非阻断观察（记录不打回）
- **O1：**「今天」页实装待办雷达（核心 acceptance 达成），未含 PRD §8.1/J1 完整驾驶舱（4-KPI strip「待你确认/Agent 今日完成/进行中/本月触达」+「Agent 今日完成」feed）；StagePanel/demo-projects 为静态占位（领域内容 → M1-M4）。与 spec §7 下游分期 + acceptance「真实占位页」一致，非 ui-fidelity 简化违规。
- **O2：** ComingSoon「返回 Dashboard」按钮仍指向 `/admin/dashboards/default`（现重定向到 today），落点正确但多一跳 + 标签略陈旧；非死链，建议后续批次改指 `/admin/today`。
- **O3：** redirect 页在 next dev App Router 下 HTTP 层返回 200（RSC/客户端跳转形态），浏览器实测最终落点正确无 404；prod next build 下为静态页。非缺陷。
- **O4：** next.config `output:'standalone'`（CICD 批次，非 F008）致 next start 告警；本验收按要求用 next dev，路由全部正常。

## 独立性与收尾
- 验收未改任何产品代码（仅临时增删 scratchpad 探针 `indep-f008.mjs`，已删）
- 真实 key 全程 mask（.env 未读值，未入报告）
- 已 kill dev server（释放 3000）+ 关 Playwright
- 仅验 F008；F009/F010 未实现属正常
