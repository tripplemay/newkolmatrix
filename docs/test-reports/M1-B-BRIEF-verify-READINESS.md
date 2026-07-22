# M1-B-BRIEF 验收分报告 — 批次级就绪回归（READINESS）

- **验收人：** Andy/evaluator-subagent（隔离 fresh context）
- **日期：** 2026-07-22
- **被验对象：** main HEAD `126b410`（产品树最后变更 commit = `6c8018f` F006；`126b410` 相对 `6c8018f` 的 diff 仅状态文件 + linux 基线，`git diff --name-only 6c8018f..126b410` 实证）
- **口径：** spec §4 末行「就绪回归」，含 `docs/specs/M1-B-BRIEF-f006-p2probe-audit.md` 裁决修订（四条 p2 探针 → 三条，p2:f003 随 image/ 死代码退役）
- **判定：PASS**

---

## 0. 环境前置（testing-env-patterns 对照）

| 项 | 实测 | 结论 |
|---|---|---|
| `prisma generate` 先于 tsc（§3） | 已执行后再跑 tsc | ✅ 排除 client 陈旧误报 |
| Node 版本 vs `.nvmrc`（§4） | 本机 v25.7.0；仓库无 `.nvmrc` | 无约束文件，不构成违规；全套件绿，无 jsdom/localStorage 类误报征兆 |
| UI 实测走 standalone（§7） | :3000 = `next-server (v15.5.20)` PID 64821，起于 Jul 21 23:44:49；`.next/BUILD_ID` mtime 23:44:41 **晚于** F006 commit 23:02:36 | ✅ 服务的是含全部 6 features 的 HEAD 产品树构建，非陈旧产物 |
| dev DB | 容器 `newkolmatrix-dev-db` Up (healthy) | ✅ |
| 服务器活性 | `/admin/today` `/admin/campaigns` `/admin/campaigns/xg-launch` 均 200，`/api/health` `{"ok":true}` | ✅ |

## 1. next lint — PASS

`npx next lint` → `✔ No ESLint warnings or errors`（0 errors / 0 warnings，无需走 lint warning 处理矩阵）。

## 2. tsc --noEmit — PASS

`npx tsc --noEmit` → 无输出，exit 0（prisma generate 之后执行）。

## 3. npm run test:unit — PASS

vitest v4.1.10：**9 文件 / 129 tests 全过**（Duration 366ms）。文件清单（`npx vitest list` 去重实证）：
`tests/unit/{compute-health-tool, env-brief, env-guards, env-guards.evaluator-probe, health, project-format, provenance, repo-hygiene}.test.ts` + `tests/integration/env-advance.test.ts`。

## 4. npm run test:visual — PASS

Playwright **13/13 passed（23.1s）**，复用 :3000 standalone（`reuseExistingServer: !CI`）：agent-canvas / creator-drawer / dashboard-today / campaigns / project-{brief,match,reach,delivery,insight} / creators / knowledge / insight / runs。阈值 `maxDiffPixels: 1500`（`tests/visual/handoffs-mock.ts:74`）。

**CI 旁证：** 产品树最后 commit `6c8018f` 的 CI run 29895524822 五 job 全 success（Lint / Typecheck / Unit+integration / **Visual regression** / Build）——linux 侧视觉在起 DB 的 visual job 下同样全绿（D7 生效的运行时证据）。

## 5. 三条 p2 探针 — PASS（口径 = 审计裁决修订后的三条）

| 探针 | 结果 | 断言数 |
|---|---|---|
| `npm run p2:f001`（抽屉四关闭路径，桌面+移动两视口） | **12 passed, 0 failed** | A/B/C/D/E + 无 page error × 2 视口 |
| `npm run p2:f002`（深色持久化 + pre-paint 无闪烁） | **14 passed, 0 failed** | 含 F-live/F-mut 变异对照（活性自证：抽掉内联脚本后断言确会翻红） |
| `npm run p2:f004`（HandoffPanel 生产/夹具同壳） | **15 passed, 0 failed** | 含 C 组「容器 class 逐字相同」实证 |

**活性/防篡改核验：** 三个探针脚本本批零改动（`git log` 最后触碰均在 M1-A / P2-CLEANUP 批次：`1f11836` / `416c23c` / `8f5f470`）——绿不是改探针改绿的。探针为正向断言型（元素缺失即红）且 f002 内建变异对照，满足 0-findings 活性证明要求。

**p2:f003 退役实证：** `scripts/test/` 无 `p2-cleanup-f003-avatar-colormode.mjs`；`package.json` 无 `p2:f003` 条目（grep exit 1）。与裁决文档 `docs/specs/M1-B-BRIEF-f006-p2probe-audit.md` 一致。

## 6. 视觉基线漂移与成因核对 — PASS

### 6.1 漂移清单与账面说明

- **`e946b49`（F001，darwin）：** 恰好 5 张 `project-{brief,match,reach,delivery,insight}-darwin.png` 变更，commit message 逐张对账：「均为 header 数据变更（goal 散文→D9 合成串 + 健康度 wn→cr 红点），重生前旧基线在 1500px 紧阈值内仍绿=无布局/字体回归证明；campaigns/en-today 零漂移」。
- **`d9ae875`（linux 基线经 update-visual-baselines workflow 重生）：** 5 张 project-*-linux 镜像同一漂移 + 4 张全量重生附带重拍（creator-drawer/creators/insight/runs）。

### 6.2 独立像素取证（本验收自制 canvas diff，通道差 >8 计差异像素）

| 图 | diff 像素 | bounding box | 判读 |
|---|---|---|---|
| project-{brief,match,reach,delivery}-darwin | 各 3779 | **(381,156)–(835,201)** 单一 header 条带 | 与账面完全一致：裁剪目检 old=散文 goal +「注意」橙点 → new=「目标曝光 300 万 · 周期 2026-07-01 ～ 2026-07-31」+「风险」红点；标题/预算/版式零变 |
| project-insight-darwin | 3845 | header 条带 + (864–979, 851–930) 66px | 66px 为 ApexCharts 圆环图描边抗锯齿噪声（裁剪目检两版「71% 休闲玩家」完全一致），非数据/布局变更 |
| project-brief-linux（d9ae875 前后） | 4790 | (381,156)–(854,201) 同一 header 条带 | linux 侧镜像同一成因 |
| creators-linux / runs-linux | 0 / 0 | — | 纯 PNG 重编码，像素恒等 |
| creator-drawer-linux | 4 | (1065,337)–(1066,340) | 亚像素噪声 |
| insight-linux | 1811 | (350,525)–(778,630) | ApexCharts 折线描边抗锯齿抖动（裁剪目检曲线形状/端点标记完全一致），CI 两次截屏间的图表渲染非确定性，非产品变更 |

**结论：** 账面「数据变更而非布局/字体回归」成立，且经独立像素取证证实——4/5 张漂移严格局限于 header 数据区，其余差异均为图表抗锯齿噪声量级；`campaigns` / `today` 基线两个 commit 均未触碰（零漂移声明属实）。「意图变更不借容忍带、显式重生」纪律（v1.0.6 §4.2 + 本批 project-status 沉淀）已执行。

### 6.3 观察项（不阻断，供记录）

- `insight-linux` 折线图描边抖动在本验收 delta>8 口径下达 1811px；playwright pixelmatch（YIQ、threshold 0.2）口径更宽松、当前 CI 绿，但该页是 12 张基线中图表噪声余量最小的一张，若未来 CI 偶发翻红优先怀疑图表尾帧抖动而非产品回归（现有 `CHART_SETTLE_MS=1500` + 单 worker 已是既定消抖手段）。

## 7. 范围与未执行项

- **[L2] 未执行，无授权亦不在就绪口径内：** `agent:smoke` 的 search_kols 段走真实网关 embedding，属 L2；就绪回归口径（spec §4 末行）不含 agent:smoke，未执行不构成缺口（compute_health 工具的直调验证由 F003 分报告承载）。
- 本报告只覆盖批次级就绪回归；F001–F006 逐 feature 验收见各自分报告 `docs/test-reports/M1-B-BRIEF-verify-F00{1..6}.md`。

---

## 判定汇总

| 就绪项 | 结果 |
|---|---|
| next lint | ✅ 0 err / 0 warn |
| tsc --noEmit | ✅ exit 0 |
| test:unit | ✅ 129/129（9 文件） |
| test:visual | ✅ 13/13（本地 darwin）+ CI linux visual job success 旁证 |
| p2:f001 / f002 / f004 | ✅ 12+14+15 断言全过，探针零篡改 |
| p2:f003 退役 | ✅ 脚本与 npm script 均已移除，符合裁决 |
| 基线漂移逐张成因 | ✅ 账面成立且经独立像素取证证实（header 数据变更 + 图表噪声，无布局/字体回归） |

**READINESS：PASS**
