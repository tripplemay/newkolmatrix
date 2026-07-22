# M1-C-LIST-TODAY — F006 验收分报告（f008 探针修缮）

- **Evaluator：** Andy/evaluator-subagent（隔离 fresh context）
- **日期：** 2026-07-22
- **被验对象：** F006「f008 探针修缮（Link 化使断言复活）」，commit `9d4aaa4`（HEAD `5a666a9`）
- **环境：** standalone `http://127.0.0.1:3000`（实证进程 41879 cwd = `.next/standalone`，符合 testing-env-patterns §7）；dev DB 容器 `newkolmatrix-dev-db`（user `kol`）；基线态 4 canonical 项目 + PendingAction=0 + OperationLog=0
- **结论：PASS（6/6 acceptance 全过，0 findings；两态实测均 12/12）**

---

## 1. 逐条 acceptance 判定

### A1 【D-G 预裁决】修缮而非退役 — PASS

- `package.json:27` 保留 `"f008:browser": "node scripts/test/f008-browser-check.mjs"`；脚本存续且被更新（非删除）。
- `git log -- scripts/test/f008-browser-check.mjs`：`dd85b6b`（F008 立项）→ `4719d9d`（ARCH-M05 F007 迁移 ?env=）→ `9d4aaa4`（本批修缮），演进链完整。
- 修缮 diff 仅动 §4/§5 两段；§1 侧栏 / §2 死链 / §3 redirect / §6 无角色切换器 / §7 console 断言原样保留（spec「接真后仍成立的断言保留原样」），本次实跑全过——守护价值存续。

### A2 更新历史漂移锚点（:70『五环节』改现渲染文案；其余按实跑逐条校准）— PASS

旧脚本 `9d4aaa4^:scripts/test/f008-browser-check.mjs:70` 确为 `ok(listText.includes('五环节') && ...)`，与 acceptance 行号引用一致。逐个锚点在**运行中的 standalone 构建**上核「旧锚已死、新锚现渲染」：

| 锚点 | 旧值（curl grep 计数） | 新值（curl grep 计数） | 判定 |
|---|---|---|---|
| §4 列表 lede | `五环节` = **0**（/admin/campaigns） | `只做进入` = **2** | 旧锚已死，新锚是现渲染文案 ✓ |
| §4 五环节名 | 英文 `Match/Reach/...` 无独立渲染 | `目标 Brief`/`创作者匹配`/`触达谈判`/`交付结算`/`复盘洞察` 于 /admin/campaigns/xg 全部 ≥1 | ARCH-M05 F007 中文化对齐 ✓ |
| §4 stagePanel 占位 | `本环节专家职责` = **0**（/admin/campaigns/xg） | `这一环节的界面与其它环节刻意不同` = **1** | 环节落地面宣示句对齐 ✓ |
| §4 切环节按钮 | `button:has-text("Reach")` | `button:has-text("触达谈判")` | 实跑通过（Copilot 切触达 Agent 断言过） ✓ |

「历史漂移非 M1-C 引入」独立佐证：`docs/test-reports/ARCH-M05-verify-B-Andy-evaluator-subagent.md` §1.3 原文在案——「f008 脚本在第 6 条 `a[href^="/admin/campaigns/"]` 超时中断……是 building 期已立项的历史断言漂移」。

### A3 §4 / §5 断言复活确认（F001/F003 Link 化）— PASS

- **§4 列表卡 anchor：** `curl /admin/campaigns` 服务端 HTML 含 4 个真实 anchor（`href="/admin/campaigns/xg?env=reach"` / `lc?env=match` / `aw?env=delivery` / `mf?env=insight`）；`campaigns/page.tsx` 无 `'use client'`、无 `router.push`，`import Link from 'next/link'`（:14）——router.push→Link 机制实证。探针点击 `a[href^="/admin/campaigns/"]` 成功进详情（后续五环节导轨断言过）。
- **§5 待办深链 anchor：** 造 fixture 后（见 §2 两态实测），`curl /admin/today` 出现 `href="/admin/campaigns/xg?env=reach"`，探针命中 `a[href*="/admin/campaigns/"][href*="env="]` 并通过形状断言 `/\/admin\/campaigns\/[^/]+\?env=/`。
- **§5 双态设计失败安全性核验（非同义反复）：** 若有 pending 但深链损坏（todoLink=null），fallback 分支断言的空态文案「今天没有需要你确认的事」此时不会渲染（有卡即无空态）→ `ok()` 必 FAIL。两分支均有硬断言，无静默放行。

### A4 修缮后 `npm run f008:browser` 全绿（standalone 实测）— PASS（两态各 12/12，本 Evaluator 亲跑）

- **零待办态（基线态原样）：** `PASS 12 / FAIL 0`，§5 走空态分支「今天零待办 → 雷达空态可见文案」，console 0 error。
- **待办态（fixture 改→验→恢复，D-H）：**
  1. 造：SQL 插入 `PendingAction{id:'evalf006fixture001', kind:'gate', toolName:'send_outreach', harmJson 合 harmSchema（action/summary/targets/irreversible）, projectId=xg, agentId='reach'}`；
  2. 验：today 页 anchor 出现、空态文案消失；`npm run f008:browser` → `PASS 12 / FAIL 0`，§5 输出「今天待办直达…（真实 anchor，href=/admin/campaigns/xg?env=reach）」；
  3. 恢复：`DELETE ... WHERE id='evalf006fixture001'` → PendingAction=0、OperationLog=0、空态文案回归（grep 计 2 = HTML+RSC payload）。基线态已复原。

### A5 修缮说明落 commit 正文 — PASS

`git show 9d4aaa4` 正文完整含：D-G 预裁决兑现、三处历史漂移校准逐条列明并标注「均非 M1-C 引入，ARCH-M05 时代 UI 演进」、断言复活双引用（F001 + ARCH-M05-verify-B:65 / F003）、§5 双态断言说明（D-A）、双态实跑记录——对照 p2:f003 先例的审计说明要求满足。

### A6 lint + tsc 绿 — PASS

L1 标配顺序（testing-env-patterns §3）：`npx prisma generate` → `npx tsc --noEmit` **exit 0** → `npm run lint` **No ESLint warnings or errors**。

---

## 2. 边界与环境核查

- **Generator 边界：** `git show 9d4aaa4 --stat` 仅 `scripts/test/f008-browser-check.mjs` + features.json/progress.json 状态文件——零产品代码改动，与探针修缮性质相符。
- **本 Evaluator 边界：** 未改任何产品代码；fixture 仅 DB 行级造→验→删，已实证复原至零行基线态。
- **Node 25.7 说明：** 本机无 `.nvmrc`；f008 为 Playwright 浏览器探针（非 jsdom/localStorage 路径），testing-env-patterns §4 的 Node 版本误报面不适用。
- **L2：** 本 feature 无外部服务/计费面，全部验收在本地 standalone 完成，无待授权项。

## 3. 复现步骤（任意 Evaluator 可重放）

```bash
# 前置：standalone 起在 :3000（cwd=.next/standalone），dev DB 已 seed 四项目、PendingAction/OperationLog 零行
npm run f008:browser                       # 态一：零待办 → 12/12（空态分支）
# 态二：造 fixture（tenantId/projectId 以本库实际 id 为准）
docker exec newkolmatrix-dev-db psql -U kol -d kolmatrix -c "INSERT INTO \"PendingAction\" (id,\"tenantId\",kind,\"toolName\",\"payloadHash\",\"harmJson\",status,\"projectId\",\"agentId\") VALUES ('evalf006fixture001','<tenantId>','gate','send_outreach','h','{\"action\":\"send_outreach\",\"summary\":\"...\",\"targets\":[\"a\"],\"irreversible\":true}','pending','<xg-projectId>','reach');"
npm run f008:browser                       # → 12/12（anchor 分支，href=/admin/campaigns/xg?env=reach）
docker exec newkolmatrix-dev-db psql -U kol -d kolmatrix -c "DELETE FROM \"PendingAction\" WHERE id='evalf006fixture001';"   # 复原
npx prisma generate && npx tsc --noEmit && npm run lint
```

## 4. 结论

**F006 = PASS。** 6/6 acceptance 逐条实证通过；§4/§5 断言复活经正反两态亲测（含失败安全性核验），历史漂移三锚点均核到「旧锚在现构建为 0 命中」的实物证据与 ARCH-M05-verify-B 在案记录；无 findings。
