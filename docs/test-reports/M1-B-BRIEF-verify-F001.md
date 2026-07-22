# M1-B-BRIEF 首轮验收分报告 — F001 详情页 RSC 直读 Project + health 接真算 + visual job 起 DB

- **验收人：** Andy/evaluator-subagent（隔离 fresh context）
- **日期：** 2026-07-22
- **被验 commit：** e946b49（F001 本体）· d9ae875（linux 基线重生）· 验收基点 main HEAD 126b410
- **验收环境：** 本地 standalone http://127.0.0.1:3000（126b410 构建产物）+ dev DB（容器 newkolmatrix-dev-db，四 canonical 项目已 seed）
- **判定：PASS**

---

## 1. 逐条 acceptance 判定

### 1.1 `[id]/page.tsx` RSC 直读 Project（slug 或 id + tenant 过滤，复用 getDevTenantId）— PASS

- **代码实证：** `src/app/admin/campaigns/[id]/page.tsx:31-34` — `getDevTenantId()` 后
  `prisma.project.findFirst({ where: { tenantId, OR: [{ slug: id }, { id }, { publicId: id }] } })`。
  tenant 过滤在 where 顶层，slug/id/publicId 三键任一命中。
- **文本偏差备注（非缺陷）：** acceptance 写 `findUnique`，实装为 `findFirst`——「slug 或 id」的 OR
  跨字段查询在 Prisma 中 `findUnique` 无法表达（unique where 不接受 OR），`findFirst` 是该语义的
  唯一正确实现。按 evaluator.md §13（功能等价的文本漂移）不改判。
- **运行时实证（RSC 确读 DB，spec §4 点名要求）：**
  1. `docker exec … psql UPDATE "Project" SET name='《星轨协议》· EVALUATOR-PROBE-F001' WHERE slug='xg'` → `UPDATE 1`
  2. `curl http://127.0.0.1:3000/admin/campaigns/xg` → 页面立即出现 `EVALUATOR-PROBE-F001`（无重启、无缓存滞留）
  3. `npm run seed:projects` 恢复 → curl 复核显示 `《星轨协议》· 全球公测预热`（命中 2 处）、PROBE 0 处；
     DB `SELECT name` 复核已还原。**改→验→立即恢复闭环完成，seed 原状已复位。**

### 1.2 找不到项目 → D2 优雅降级 — PASS

- `curl /admin/campaigns/starlight-protocol`（旧 demo id，DB 无此行）→ **HTTP 200**；
- h2 项目名回退渲染 `starlight-protocol`；「待补充」占位 ×4（goal/预算/健康度/负责人）；
- RSC payload `"project":null`、`"error":null`、`"digest":"$undefined"`，页面无 `Application error`，
  未触发错误边界；env 面照常渲染。符合 page.tsx 注释声明的「不 404、名回退、其余待补充」契约。

### 1.3 ProjectDetail 保持 'use client'，getMockProject 换 project prop — PASS

- `ProjectDetail.tsx:15` `'use client'` 保留（tab 交互）；`:61-73` 定义可序列化 `ProjectDetailData`
  契约（含 D5 的 `maxReached` 与 F004 用 `goal`），`:75-91` 以 `project`/`health` prop 接收。
- grep 实证：`getMockProject` 在 `src/components/project/ProjectDetail.tsx` 中仅剩注释一处（说明性），
  运行代码零调用；全仓其余命中仅 `mock/projects.ts:88`（定义）与 `mock/env-brief.ts`（F002 分流职责，不属本条）。

### 1.4 RSC 内调 computeHealth（parseProjectGoal + null 因子）→ health prop — PASS

- `page.tsx:39-51`：`parseProjectGoal(row.goal)` 解析 jsonb；`actualExposure: null`、`budgetSpent: null`
  （M2/M3 才有存处）、`blockerCount: 0`（无阻塞表，符合 health.ts:71 约定）；`now: new Date()` 在 RSC
  边界注入，`domain/health.ts` 维持纯函数（不读时钟/DB）。
- SSR payload 实测：xg `health:{score:26,band:"cr"}` —— 与 building 记录的 xg score=26 一致，
  且是我独立 curl 取得，非转述。

### 1.5 【D2】四项目含 xg 全 cr = 接受的预期；不打算法补丁、不 seed 假指标 — PASS

- 四页 curl 实测：xg 26/cr · lc 37/cr · aw 23/cr · mf 20/cr，dot 均 `bg-red-500`、label「风险」。
- 无算法补丁实证：`git diff e946b49^..126b410 -- src/lib/domain/health.ts` 的非注释改动仅 F005 类型
  反转一处（`export type HealthBand = 'gd' | 'wn' | 'cr'` 替换 import 自 mock），四因子计算逻辑零改动。
- 无假指标实证：`scripts/seed/canonical-projects.ts` 通读——不 seed health、不 seed actualExposure/
  budgetSpent，本批仅追加 D7 自建 dev tenant 的 upsert（+19 行）。

### 1.6 货币格式化 helper — PASS

- `src/lib/display/project-format.ts` `formatBudget(amount, currency)`：Decimal 由 RSC `Number()` 后传入，
  USD 18000 → `$18,000`（与旧 mock 串同形）；null → null（页面渲染「待补充」）；非法 currency 降级
  `18,000 USD` 不抛错。页面实测 header 显示 `$18,000`。
- 单测 `tests/unit/project-format.test.ts`（10 条）覆盖 null/非法币种/整万缩写等分支，本人实跑通过。

### 1.7 【D9】goal 从结构化字段合成展示串 — PASS

- `formatGoalText`：`{targetExposure, periodStart, periodEnd}` →
  `目标曝光 300 万 · 周期 2026-07-01 ～ 2026-07-31`（xg 页面实测原文命中）；goal 解析失败 → null →「待补充」。
- 整句 mock 散文已不出现在详情页 header（视觉基线对比亦证实，见 1.9）。

### 1.8 【D7】CI visual job 起 pgvector + migrate + seed — PASS（含实跑证据）

- `.github/workflows/ci.yml` visual job：`pgvector/pgvector:pg16` service（health-cmd pg_isready）
  + `npx prisma migrate deploy` + `npx tsx scripts/seed/canonical-projects.ts` + build + `npm run test:visual`。
- **实跑核证（spec §4：须核实际跑了 migrate+seed 非只加 service 块）：** main 最新 CI run 29895524822
  的 Visual regression job 步骤级结论——`Initialize containers: success` · `Apply migrations: success` ·
  `Seed canonical projects: success` · `Visual regression: success`，job conclusion=success。
- 加分项（同构防坑）：`update-visual-baselines.yml` 基线重生 workflow 同构起 DB——避免把错误态固化进
  基线的「两边都是错误页所以永远绿」静默坑。
- seed 自建 dev tenant（不依赖 seed:kol/网关凭据），视觉门无外部抖动，与 D7 理由一致。

### 1.9 受影响基线逐张对账、不盲重生 — PASS（本人独立抽查复核）

- 漂移面：e946b49 更新 `project-{brief,match,reach,delivery,insight}-darwin.png` 5 张；
  d9ae875（workflow 重生）更新对应 5 张 linux + 4 张 ±≤20 字节的 PNG 编码噪声（creators/creator-drawer/
  insight/runs，抗锯齿级，非布局回归）。
- **独立抽查（不采信 commit message）：** 本人从 `e946b49^` 提取旧基线与新基线并排目检两对：
  - `project-brief`：旧 = goal 散文「公测前 30 天内获得 300 万曝光…」+ 健康度「注意」琥珀点；
    新 = D9 合成串 + 「风险」红点。**其余全部区域（侧栏/rail/brief 面/Copilot 栏）逐区一致。**
  - `project-reach`：同样仅 header 两处数据变更，reach 收件箱面逐区一致。
  - 5 张截图均为 `/admin/campaigns/xg?env=…` 深链（`tests/visual/workbench.spec.ts:31-63`），header 同源，
    抽查 2/5 已覆盖「header-only 变更」命题的两类面（默认面 + 非默认面）。
- `campaigns`/`en-today` 基线零漂移，与「列表页仍 mock 的过渡态」记录一致。

### 1.10 lint + tsc + test:unit 绿 — PASS（针对性实跑；全量由就绪回归 agent 复核）

- `npx tsc --noEmit` → exit 0；
- `npx eslint`（F001 四个触改文件）→ 0 问题；
- `npx vitest run tests/unit/project-format.test.ts tests/unit/health.test.ts` → **42/42 passed**（143ms）。
- 批次级全量 lint/test:unit/test:visual/三条 p2 探针由就绪回归专项 agent 执行，不在本报告重复。

---

## 2. 复现步骤汇总

```bash
# RSC 直读实证（改→验→恢复）
docker exec newkolmatrix-dev-db psql -U kol -d kolmatrix \
  -c "UPDATE \"Project\" SET name='PROBE' WHERE slug='xg';"
curl -s http://127.0.0.1:3000/admin/campaigns/xg | grep PROBE      # 命中
npm run seed:projects                                               # 恢复
curl -s http://127.0.0.1:3000/admin/campaigns/xg | grep 全球公测预热  # 还原

# D2 降级
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/admin/campaigns/starlight-protocol  # 200

# 四项目 health 全 cr
for s in xg lc aw mf; do curl -s http://127.0.0.1:3000/admin/campaigns/$s | grep -o '"band\\\\":\\\\"cr'; done

# CI visual job 实跑步骤
gh run view 29895524822 --json jobs --jq '.jobs[]|select(.name|test("Visual"))|.steps'

# 基线对账抽查
git show e946b49^:tests/screenshots/baseline/project-brief-darwin.png > /tmp/old.png  # 与新版目检对比
```

## 3. 备注（非缺陷）

1. `findUnique` → `findFirst`：acceptance 文本与实装的 API 名漂移，功能等价且 OR 跨字段查询必须
   `findFirst`，不改判（evaluator.md §13）。
2. 列表页 mock（wn/gd/gd/cr）vs 详情页真值（全 cr）不一致：D2 裁决记录在案的过渡态，M1-C 消解，非缺陷。
3. 深链 `?env=` 不经 canEnter 拦截：D4 设计（URL 即状态契约），视觉 5 深链探针照常工作，属 F004 范畴。
