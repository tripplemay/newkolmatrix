# M3-B-DELIVERY F009 验收报告

- **Feature：** F009 — V7 条件台账接真（mock 退役）+ payout 闸门真链
- **验收人：** Andy / evaluator-subagent（隔离上下文，fresh context）
- **阶段：** verifying（首轮，fix_rounds=0）
- **日期：** 2026-07-23
- **结论：** **PASS**
- **取证基准：** 磁盘 progress.json / features.json / docs/specs/M3-B-DELIVERY-spec.md §6 / ARCH-M05-ui-inventory V7 / framework/patterns/{ui-fidelity-guardrail, web-runtime-patterns §4/§4.5}；实测于本地 standalone 产物（:3000 独占）+ 真库（newkolmatrix-dev-db:5434）。**不接受任何转述。**

---

## 1. 验收范围（acceptance 逐条 → 判定）

| # | acceptance 条目 | 判定 | 证据 |
|---|---|---|---|
| 1 | ui-inventory V7 11 元素逐处保持 | ✅ PASS | §2 逐元素对照 + 两视口运行时在场 |
| 2 | 反向 guardrail 保持（无 KPI/图表/推荐卡/批量放款——一律未补） | ✅ PASS | §3 静态 grep + 运行时 count=0 |
| 3 | ready 值 = deliveryCheck 真值 | ✅ PASS | surface-data `ready: c.check.ready`；集成测断言 |
| 4 | 放款经真闸门链路（无 stub 残留） | ✅ PASS | §4 grep 零命中 + 端点真链探针 |
| 5 | 空态语义保留 | ✅ PASS | `DELIVERY_EMPTY_TEXT` 与 spec 逐字一致；空态基线硬断言 |
| 6 | env-delivery.ts 退役登记（mock/index.ts 表更新） | ✅ PASS | 文件已删除 + mock/index.ts:15 退役登记 |
| 7 | 视觉基线逐处对账（§4.5 重生序 + 三连稳）——本报告仅对比不重生 | ✅ PASS | §6 delivery darwin 基线对比通过，png 零改动 |
| 8 | 两视口实测 | ✅ PASS | §5 f009:viewport（1512+1280）ALL PASS |

---

## 2. V7 11 元素逐处对照（ui-inventory L77-78 / spec §2.3）

源：`src/components/envs/delivery/index.tsx`（组件读取全文核对）+ 运行时两视口在场断言。

| 元素 | 落点 | 判定 |
|---|---|---|
| ① 台账 7 列（DataTable） | columns 数组 7 项：创作者/交付·内容·Key·合同·托管·#ad·放款（`grep header:` = 7） | ✅ |
| ② 行 who 纯色方块 av（非色轮）+名 | L191-206 `style={{ background: row.av }}` + `who.slice(0,2)` + 名；av 取 `ledgerAvColor(kolId)` 稳定散列五色板（**非** ProjectAvatar 色轮） | ✅ |
| ③ sub 交付物 | L202-203 `{row.sub}`（缺→「—」） | ✅ |
| ④ 🔒 note 附注条件渲染 | L204 `{row.note != null && ` · ${row.note}`}`（人工 note 优先，缺则 `describeGaps` 合成） | ✅ |
| ⑤ 条件单元 ok绿/miss琥珀/na灰三态（不压二态） | `COND_STYLE` 三处独立键：ok=green+MdCheck / miss=amber+MdErrorOutline / na=gray+**无图标**「—」；集成测断言 `Set(['ok','miss','na'])` 同屏可辨 | ✅ |
| ⑥ 放款金额右对齐 800 | L235 `meta: RIGHT`（align right）+ L240 `font-extrabold tabular-nums` | ✅ |
| ⑦ 🚪「放款」红 gate（仅 ready） | L249-258 `row.ready ? <Button variant="danger">放款</Button>`（仅 ready 行渲染） | ✅ |
| ⑧ 🔒「条件未齐」灰字（替代按钮位，不得改 disabled 按钮） | L259-264 `<small className="text-gray-400">条件未齐</small>`——是灰字文本**替代**按钮位，非 `<Button disabled>` | ✅ |
| ⑨ 🔒 底部 shield 宣示句（逐字） | L284-294 shield icon + 「…没有 AI 推荐卡——只有条件是否满足…缺什么显什么，不提供绕过入口。」 | ✅ |
| ⑩ 已放款态（Payout released 真值，原 mock paidIds 退役） | L243-248 `row.paid ?`「已放款」green check；`paid` 来自 `Payout(status='released')` 真查（surface-data L40-48） | ✅ |
| ⑪ payout 闸门确认卡：harm 3 行（收款方/金额/依据）+ 资金 irrev | L298-332 GateConfirm，harmRows 收款方/金额/依据 + `irrevText="资金动作 · 放款后不可撤销"`；行值全部取服务端真 harm（§9.5 确认卡只呈现不改写） | ✅ |

**结论：11 元素逐处保持，无简化、无语义替换、无区块删除。**

---

## 3. 反向 guardrail 未补（刻意无 KPI/图表/推荐卡/批量放款）

- **静态：** delivery 组件仅 import `DataTable / GateConfirm / SurfaceCard / Toast / Button / react-icons`——**无** MiniStatistics/Chart/apexcharts/recharts 任何图表件（grep 命中仅注释与 shield 宣示文本）。
- **运行时（两视口）：** `批量放款 / 全部放款 / 推荐 / KPI` 反向词剔除 shield 宣示句后**零命中**；图表元素 `.apexcharts-canvas, canvas, svg.recharts-surface` **count=0**；无横向溢出（0px）。

---

## 4. payout 闸门真链（无 stub 残留）

- **grep 零命中（产品代码）：** `confirmPayout`=0 · `mockDeliveryLedger`=0 · `paidIds`=0（仅注释描述退役事实）。
- **链路实测：** `POST /api/delivery/payout` → `executeTool('payout')`（真唯一执行入口）。对不存在的 Deal 发起 → 返回 **HTTP 400 `{"error":"[payout] 交易不存在: ..."}`**——服务端真判定原文透传，**非 D6 stub 的「确认即 Toast + 本地态」假成功**。坏入参 → zod 400 `Invalid input`。
- **确认卡真 harm：** 前端 `startPayout` 走 POST→pending→`GET /api/actions/[id]`→confirm→execute→`router.refresh()`；harm 行渲染服务端返回值不改写（§9.5）。
- **P1 零真实资金动作：** payout 执行 = mock EscrowPartner + `Payout prepared→released` + Deal 推进 + irrev 留痕；无 REAL 分支、无可误触真实付款开关。**本批未发生任何真实付款/key 发放外呼。**

---

## 5. 两视口实测（npm run f009:viewport，standalone :3000）

- **wide-1512 + narrow-1280**：`RESULT: ALL PASS`
- 每视口：10 元素在场（7 列头 + 空态文案 + shield 双句）· 4 反向 guardrail 未补 · 无图表 · 无横向溢出——两视口全绿。

---

## 6. 视觉基线（仅对比，未重生）

- `npx playwright test -g "project env=delivery visual baseline"` → **1 passed**（当前 standalone build 与已提交 `project-delivery-darwin.png` 逐像素一致）。
- 基线态 = 夹具项目**空态**（spec §2.4 口径：接真后基线态 = 空态，硬断言「还没有交易…」防静默空白）。
- **未改动任何基线 png**（`git status tests/screenshots/baseline/` 空）——遵守边界，只跑对比不重生。Generator 已在 72d63d8 按 §4.5 重生序重生该张（301077→261082 bytes），当前对比通过即证基线与产物对齐。
- §4.5 端口归属核实：验证前已 kill :3000 残留 `next-server`（防 `reuseExistingServer` 静默复用）；standalone 起服**未注入真网关 key**，无 lazy 生成写库（dev DB Deal 计数 = 0，空态纯净）。

---

## 7. L1 基础设施

| 项 | 结果 |
|---|---|
| `npx prisma generate` | ✅ 干净（tsc 前置，testing-env-pattern §15） |
| `npx tsc --noEmit`（**产品代码**） | ✅ **src/ 0 errors**；F009 相关文件 0 errors |
| `npx next lint` | ✅ No ESLint warnings or errors |
| `npx vitest run tests/integration/delivery-surface.test.ts` | ✅ **7 passed**（ready 真值/三态不压/paid=Payout 真值/金额缺→「—」/sub+note/av 稳定散列/空态） |
| `npm run build`（standalone） | ✅ 成功 |
| standalone serve + `/api/health` | ✅ `{"ok":true}`，delivery 页 HTTP 200 |

> **环境注记（非 F009 缺陷）：** 共享 tsc 运行报 3 处 `TS7018`，全部落在**其他 fan-out evaluator 的 probe 测试文件**（`tests/unit/delivery-check.evaluator-probe.test.ts` · `tests/unit/partner-adapters.evaluator-probe.test.ts`），属 sibling 验收产物，非 F009、非产品代码、非我方职责范围（不越界修改）。F009 产品代码与测试产物零 tsc 错。

---

## 8. Soft 观察（非阻断）

- **S1（低）：** `tests/integration/delivery-surface.test.ts` 的 `loadRows()` 助手**重实现**了行映射，而非直接调用生产 `loadDeliverySurfaceData`——原因是后者硬编 `getDevTenantId()` 无法注入夹具租户（测试文件 L26 已注明）。后果：生产 `noteOf()` 合成逻辑（人工 note 优先 → 缺口摘要回退 → null）未被集成测**直达**。缓解：`noteOf` 的两个输入（人工 note 数组、`describeGaps` 缺口摘要）均已单独验证，且 note 条件渲染在组件层 L204 已确认；`noteOf` 本身为 5 行确定性纯函数。建议下批次将 `loadDeliverySurfaceData` 的 tenant 解析改为可注入（或导出 `noteOf` 单测），使生产装配壳获直达覆盖。**不构成 F009 acceptance 阻断项。**

---

## 9. L2 标注

- **[L2] 未执行，待授权：** 真实资金放款 / key 外呼、真网关 `track_delivery` LLM 摘要——本次验收**未授权**，未执行。P1 零真实资金动作断言由 mock 适配器 + 无 REAL 分支满足（§4），本地已充分证伪「假成功」路径。

---

## 10. 收尾

- :3000 standalone 服务已 kill，端口空闲（`port-free (cleaned)`）。
- 未修改任何产品代码 / 文档基线 / 视觉基线 png；仅新增本报告。

**最终判定：F009 = PASS。**
