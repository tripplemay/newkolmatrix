---
name: project-status
description: 项目当前状态快照（覆盖写，≤30 行）— 当前批次、计划、决策、遗留问题
type: project
---
## 当前批次
- **P2-CLEANUP done ✅ 且已上线用户验收通过（2026-07-22）** — 5/5 PASS，fix_rounds=1；signoff `docs/test-reports/P2-CLEANUP-signoff.md`；用户线上逐条验收「通过」（`docs/test-reports/user_report/P2-CLEANUP-线上验收说明.md`）
- **交付：** F001 抽屉遮罩关闭（根因实测 container height=0px，`containerProps.style` 补 100vh）· F002 深色持久化（`kolmatrix.colorMode` + pre-paint 内联脚本）· F003 Avatar 边框跟随（改用 Tailwind `dark:` 变体）· F004 抽 `common/HandoffPanel`，夹具对齐生产 · F005 CreatorDrawer 入基线
- **fix_round1 教训：** F003 首版按 acceptance 字面「改读 hooks/useColorMode」实装 → 判 PARTIAL。该 hook 每调用点独立 state、零跨实例订阅，纯读取方活体切换不跟随。改用 `dark:` 变体（项目主导范式，84 文件）绕开
- **回归资产：** `npm run p2:f001~f004`（浏览器探针须先起 standalone 并 `export BASE`）+ `tests/visual/creator-drawer.spec.ts` + evaluator 两套独立 harness（`scripts/test/f003-harness/`、`f003-reverify/`）
- **上一批 ARCH-M05 done ✅** — M0.5 六页工作台，已部署 live（钉 SHA `d5256a8`）

## 已上线
- `https://newkol.guangai.ai` 当前跑 **P2-CLEANUP 版 @ `0c36fc2f24395be5bbf9af60a0cf4342dde057be`**（2026-07-22 部署，线上 7 探针确证）；回滚=deploy-prod 填上一版 **完整 SHA** `d5256a8...`（ARCH-M05 版）
- ⚠️ **deploy 的 image_tag 必须填完整 40 位 SHA**，短 SHA 会 pull 失败（见 environment.md）

## 演进路线（architecture.md v1.2 §14）
- M0 ✅ → **M0.5 ✅** → **M1 BRIEF-CAMPAIGNS（下一站）** → M2 MATCH → M3 REACH/DELIVERY → M4 INSIGHT → M5 PROD-HARDENING

## 需求池（backlog.json）
- **BL-FE-16（P2）** — `useColorMode` 跨实例不同步（纯读取方 + 多标签页均不同步），DS-FOUNDATION F005 遗留
- **BL-FE-17（P2）** — `ChakraNextAvatar` + `showBorder` 边框恒不渲染（`shouldForwardProp` 白名单拦下），既存行为；建议与 BL-FE-16 合成「`image/` 模板残留统一处置」批次

## 待人类处理
- `framework/proposed-learnings.md`：**P2-CLEANUP 新增 4 条待裁决**（视觉用例首推 CI 必红 / 消费点+属性生效性入勘查清单 / 断言换实现后退化为恒真 / 合成节点探针保真度）；另有 harness-fit 9 条长期挂起（用户三度裁决继续挂起）

## 关键技术坑（沿用 framework v1.0.6）
- UI 实测一律 standalone 不走 next dev · CDN 字体是视觉测试抖动总根源 · Tailwind JIT 双域 token · 基线重生用 `--update-snapshots=all` 断言用紧阈值 · 空数据基线须 waitFor 硬断言
- **本批新踩：** 新增视觉用例首推 CI 必红（linux 基线不存在）→ 手动跑 `Update visual baselines`，而其 commit 带 `[skip ci]`，须另有一次非忽略路径 push 才能验 CI 绿
- **断言退化坑：** 子串正则断言在实现形态变化后可能静默变恒真（signoff §2.3：`/border-navy-700/` 命中 `dark:border-navy-700` 内部）——换实现后须重审既有断言强度，不能只看转绿

## 已知下游（不在当前）
- M1 起各专家领域工具 · MCP 实装 · 真实认证/RLS（M5）· 真实 outbound 投递 · harness-fit 9 条挂起
