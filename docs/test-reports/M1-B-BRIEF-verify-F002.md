# M1-B-BRIEF 首轮验收分报告 — F002 brief 分流 bug 修复（机械分流，优雅降级）

- **验收人：** Andy/evaluator-subagent（隔离 fresh context）
- **日期：** 2026-07-21（本地时间）
- **被验对象：** main HEAD `126b410`（F002 实现 commit `e600977`）
- **验收依据：** features.json F002 acceptance 全文 + `docs/specs/M1-B-BRIEF-spec.md` §2 F002 / §3 D3 / §4 F002 行
- **测试层级：** 全部 L1（本地代码实证 + 单测 + 本地 standalone :3000 SSR 实测）。无 L2 项，未动网关。
- **结论：PASS（6/6 acceptance 子项全过，0 缺陷）**

---

## 逐条 acceptance 判定

### 1. env-brief.ts 按 projectId 分流：仅 xg → canonicalBrief，lc/aw/mf → emptyBrief — PASS

实物：`src/lib/data/mock/env-brief.ts:166-168`（原 :161 三元式随注释扩充下移）：

```ts
export function getEnvBrief(projectId: string): EnvBrief {
  return getMockProject(projectId)?.id === 'xg' ? canonicalBrief : emptyBrief;
}
```

- 经 `getMockProject` 归一（保 `LEGACY_ID_ALIAS`：`starlight-protocol` → xg 仍得 canonical，f007/f010 深链不回归——单测第 5 条实证）；
- `emptyBrief`（:148-154）五深字段全 null；未知 id 同走 emptyBrief（D2 既有行为不回归——单测第 6 条实证）。

修复前对照（read-only worktree @ `e946b49`，见 §3）：`env-brief.ts:161` 为
`getMockProject(projectId) ? canonicalBrief : emptyBrief` —— 四 canonical 项目共享同一 xg 引用，bug 属实。

### 2. readContractSlot null → 「待接入」占位，绝不抛错 — PASS

- 代码：`src/lib/data/provenance.ts:80-101` —— raw null/undefined → return null（:85）；schema 校验失败 → safeParse 降级 null（:86-99）；无任何 throw 路径。
- 消费端：`src/components/envs/brief/index.tsx:209-233` 五段深字段逐段过 `readContractSlot`，null → `PendingSlot`（「{label} · 待接入」，:134-140）。
- 实测（本地 standalone :3000，HEAD 构建产物，curl SSR HTML）：

| 页面 | HTTP | 「待接入」占位 | xg 深字段数据泄漏（$11.5k / 硬核射击向创作者 / 在谈创作者 / 目标与预算确认） |
|---|---|---|---|
| `/admin/campaigns/mf?env=brief` | 200 | 4 处（曝光达成/项目指标/曝光趋势/推进计划） | 0 |
| `/admin/campaigns/lc?env=brief` | 200 | 4 处 | 0 |
| `/admin/campaigns/aw?env=brief` | 200 | 4 处 | 0 |
| `/admin/campaigns/xg?env=brief` | 200 | 0（canonical 全量渲染） | —（应有：192万/300万✓ $11.5k✓ 触达谈判中✓ 1 处阻塞✓） |

占位是 4 处而非 5：blocker null = 「无阻塞（不渲染阻塞卡）」是 D2 既有契约明文（env-brief.ts:11、brief/index.tsx:16），非缺陷。

mf 页仅存的两处貌似 xg 字样均已逐处溯源排除：
- 「触达谈判」＠rail 按钮 —— 环节导轨的 env 显示名（导航件，非 brief 面数据）；
- 「192万 / 300万 曝光」＠Copilot 侧栏 —— 出自 `src/components/copilot/mock.ts:322-323`（ARCH-M05-F003 既有 mock 面，本批零改动，`git log e946b49..126b410 -- src/components/copilot/mock.ts` 为空），不在 F002 范围（spec D1 收窄仅 brief 分流）。

### 3. D3：不为 lc/aw/mf 补写 mock — PASS

`e600977` 对 `env-brief.ts` 仅 +10/-2（分流逻辑与注释），emptyBrief 保持全 null，未新增任何 lc/aw/mf 数据行。全文件通读确认无新 mock 数据。

### 4. 回归测试须能对比修复前后 — PASS（RED/GREEN 亲测复现）

`tests/unit/env-brief.test.ts`（6 用例）：

- **修复后（HEAD）：** `npx vitest run tests/unit/env-brief.test.ts` → **6 passed**。
- **修复前（RED 实证）：** scratchpad 建 read-only worktree @ `e946b49`（F002 前一 commit），复制同一测试文件运行 → **3 failed | 3 passed**，失败信息精确命中 bug 形态：
  `mf.gauge 应为 null: expected { percent: 64, sub: '192万 / 300万 曝光' } to be null`（lc/aw 同）。
  通过的 3 条（xg canonical / legacy alias / 未知 id）是两态下都应成立的锚定项，符合预期。
- 测试含防假绿锚定：xg 用例不止断言非 null，还 `briefGaugeSchema.parse` 后断言 `percent === 64`、`sub === '192万 / 300万 曝光'`（防「非 null 但被换成别的数据」）。
- worktree 用毕已删除（`git worktree list` 恢复仅主目录）。

### 5. 视觉基线核实：project-brief.png 截的是哪个项目 — PASS

- `tests/visual/workbench.spec.ts:31-37`：`page.goto('/admin/campaigns/xg?env=brief')` → **截的是 xg**。
- 按 acceptance 分支「若 xg 则 brief 内容不变（仅 F001 的 health 头部变）」：F002 无需动基线。实证 `git show --stat e600977 -- tests/visual` 为空（F002 commit 零基线变更），header 漂移已在 F001 对账（另由 F001 分报告覆盖）。

### 6. lint + tsc 绿 — PASS

- `npx tsc --noEmit` → exit 0；
- `npx next lint` → 「No ESLint warnings or errors」exit 0。

---

## §4 验收口径对照（F002 行）

| §4 要求 | 判定 |
|---|---|
| `getEnvBrief('mf')` 五深字段全 null（回归测试实证） | PASS（单测 + RED/GREEN 对照） |
| `getEnvBrief('xg')` 仍 canonical | PASS（单测锚定 64% / 192万，:3000 实测全量渲染） |
| 线上 bug（四项目共享 xg 数据）消除 | PASS（mf/lc/aw 三页 SSR 实测零泄漏 + 头/面不再打架：mf 头「萌宠农场/$7,500」+ 面「待接入」） |

## 观察项（非缺陷，不入 problems）

- Copilot 侧栏 mock（`copilot/mock.ts`）在所有项目页仍显 xg 风味内容（「查看目标健康度 · 192万 / 300万 曝光」卡）。属 ARCH-M05 既有 mock 面，spec D1 明确本批范围仅 brief 分流，留待后续批次接真数据时消解。

## 复现步骤汇总

```bash
# 1. 分流单测（GREEN）
npx vitest run tests/unit/env-brief.test.ts        # 6 passed

# 2. RED 对照（scratchpad worktree，勿在主仓 stash）
git worktree add --detach <scratch>/prefix-f002 e946b49
ln -s $PWD/node_modules <scratch>/prefix-f002/node_modules
cp tests/unit/env-brief.test.ts <scratch>/prefix-f002/tests/unit/
(cd <scratch>/prefix-f002 && npx vitest run tests/unit/env-brief.test.ts)  # 3 failed
git worktree remove --force <scratch>/prefix-f002

# 3. 实测（standalone :3000 已运行）
curl -s "http://127.0.0.1:3000/admin/campaigns/mf?env=brief" | grep -c 待接入   # 4
curl -s "http://127.0.0.1:3000/admin/campaigns/mf?env=brief" | grep -c '\$11.5k' # 0
curl -s "http://127.0.0.1:3000/admin/campaigns/xg?env=brief" | grep -c '192万 / 300万 曝光' # ≥1

# 4. 门禁
npx tsc --noEmit && npx next lint
```
