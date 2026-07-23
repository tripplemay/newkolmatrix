# M2-B-CREATORS 复验（fix_rounds=1）— READINESS（批次级就绪回归）

- **署名：** Andy/evaluator-subagent（隔离 fresh context）
- **日期：** 2026-07-23
- **首轮结论：** PARTIAL —— 8 门中 7 门绿；`test:unit` 门真凭据本地约 2/3 概率红。
  根因：`tests/integration/match-verdict.test.ts` beforeAll 未建组 → 断言 1 的
  `loadMatchSurfaceData` 命中 P2 lazy → `generateCandidates` 无 deps 回落真网关 embed
  （P7「集成测不打网关」违反 + 真网络延迟压穿 vitest 5000ms testTimeout）。
- **修复实物：** commit `7cebb52`，`tests/integration/match-verdict.test.ts:65-70` ——
  `generateCandidates` 后补 `await buildMatchPlans(projectId)` 建组守卫（F007
  `score-upgrade.test.ts:128-131` 同款先例）。纯测试文件修复；产品代码 lazy 路径
  （`surface-data.ts:47-49`）与 embed 回落（`generate-candidates.ts:119`）语义未动。
- **结论：PASS** —— 首轮指向面全部消失（含 P7 违反的网络层铁证归零），无新回归。

---

## 1. 环境与基线态核查（前置）

| 项 | 实测 | 判定 |
|---|---|---|
| :3000 | `lsof -ti :3000` 空，全程未起（端口纪律） | ✓ |
| dev DB | `newkolmatrix-dev-db` Up (healthy) | ✓ |
| Kol 库 | 2526 行；2 视觉夹具在场（`vk-visual-full-0001` dataSource=crawl / `vk-visual-null-0002` user_upload） | ✓ |
| Match 三表 / PendingAction / OperationLog | 起跑 0/0/0/0/0（D-H 清态）；测试租户 0 | ✓ |
| 真凭据 | `.env` 持真 `AIGCGATEWAY_BASE_URL=https://aigc.guangai.ai/v1` + API key；vitest.config `loadEnvFile('.env')` 生效——与首轮红门同等条件 | ✓ |
| 守卫非网络依赖 | `build-plans.ts` 全文 grep embed/chat/gateway 零命中——守卫本身纯规则，不引入新网络耦合 | ✓ |

## 2. 首轮 steps_to_reproduce 逐字复现

| # | 首轮步骤 | 首轮结果 | 本轮实测 | 判定 |
|---|---|---|---|---|
| 1 | 真凭据隔离 `npx vitest run tests/integration/match-verdict.test.ts` | 3 跑 1 绿 2 红（3.52s / 5.06s / 5.07s，~2/3 概率超时） | **3 连绿** 5/5 ×3，Duration 297ms / 275ms / 298ms——无任何秒级网络等待 | **缺陷消失** |
| 2 | 伪网关对照 `AIGCGATEWAY_BASE_URL=http://127.0.0.1:9 AIGCGATEWAY_API_KEY=probe npx vitest run …` | 恒绿 410ms | 绿 5/5，432ms | ✓ 对照一致 |
| 3 | 根因阅读 | :60 无建组 | :65-70 建组守卫在场，注释明记根因与先例归属 | ✓ |

## 3. P7 违反消除的网络层铁证（本轮加测，确定性判据）

首轮红为概率性（~2/3），单纯复跑绿存在「环境侥幸」不可分辨问题；且实测发现
**vitest 4.1.10 默认 reporter 在管道输出下不显示 console.warn**（探针测试实证）——
首轮报告依赖的 D2 降级 warn 不可作为 stdout 判据。故本轮改用网络层计数检测器：
本地起计数假网关（记录每个请求、回 500 走 D2 降级），新旧两版测试同条件对跑：

| 版本 | 网关命中 | 说明 |
|---|---|---|
| 旧版（`8fd275f`，修复前，临时探针文件） | **2 次 `POST /embeddings`** | 断言 1 内 verdict 前后两次 `loadMatchSurfaceData` 各触发一次 lazy（首次 embed 抛错致 plans 仍 0，第二次再触发）——与首轮「真网关 ~2.5s×2 压穿 5000ms」的概率模型完全吻合 |
| 新版（`7cebb52`，修复后） | **0 次** | 建组守卫使 plansCount>0，lazy 永不触发——P7 违反根治，检测器活性由旧版 2 命中同场证明 |

零真网关花费（全部探针走本地假网关）；探针测试文件测毕即删。

## 4. 主门与快门

| # | 门 | 结果 | 证据 |
|---|---|---|---|
| 1 | `npm run test:unit`（全量真凭据）**×2 连跑** | **PASS ×2** | 34 文件 **358/358** 绿 ×2（Duration 2.18s / 1.94s，无网络等待）。首轮 355/356 → 用例 356→358 为 F002/F001 修复新增单测（终态判据：无删减，match-verdict 5 断言原样在场） |
| 2 | `npm run lint`（快门抽查） | PASS | `✔ No ESLint warnings or errors`（0/0，§15 矩阵无触发） |
| 3 | `npx tsc --noEmit`（快门抽查） | PASS | exit 0 |

其余七门（build / test:visual / p2 探针 ×3 / f008:browser / f010:e2e / m1c-substitute）
首轮已绿且本修复为测试文件级、产品代码零变更（fix commit 中 `src/` 改动仅
`mock/index.ts` 翻牌注释与 `kol-sync/derive.ts` 五因子——归 F004/F002 复验轨），
按复验指令不全量重跑。

## 5. 收尾清理（D-H 终态 = 起始基线态）

- 终态逐项与起跑基线相等：Kol 2526（2 夹具 dataSource 不变）、Match 三表 0/0/0、
  PendingAction 0、OperationLog 0、测试租户 0；
- 临时产物全清：旧版探针测试文件 ×3 次使用均即跑即删（`git status` 无残留）、
  计数网关与 DB 核查脚本均在 scratchpad（会话隔离目录，不入仓）；
- :3000 全程未起，无需杀进程。

## 6. 结论

**READINESS：PASS。** 首轮 PARTIAL 唯一指向面（真凭据 test:unit 门 match-verdict
超时红 + P7 真网关耦合）经守卫修复后：隔离 3 连绿（毫秒级、无网络）、全量 2 连绿
358/358、伪网关对照绿、网络层计数铁证旧 2 hit → 新 0 hit。无新回归
（lint 0/0、tsc 0、用例数净增无删减、产品代码 lazy/D2/P4 语义未动、DB 终态无污染）。
