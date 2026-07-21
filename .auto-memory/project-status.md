---
name: project-status
description: 项目当前状态快照（覆盖写，≤30 行）— 当前批次、计划、决策、遗留问题
type: project
---
## 当前批次
- **M1-A-BRIEF building 🔨（2026-07-22 起）· 慢车道** — 6 features 全 generator；spec `docs/specs/M1-A-BRIEF-spec.md`
- **定位：** M1 官方清单是 3-4 批的量，用户裁决先纵切 project+brief，本批只做该纵线的**地基与领域层**，页面接真数据留 M1-B
- **范围：** F001 vitest 地基 + CRA 残留清理 · **F002 拆 NoSSR 恢复 SSR（最高风险）** · F003 Project schema 扩展 + expand-contract 迁移 · F004 `domain/health.ts` · F005 `domain/env-guards.ts` + 变异测试 · F006 环节推进写 OperationLog
- **用户四裁决：** cur 存双值 cur+maxReached · 环节推进写 OperationLog · 数据通道走 RSC 直读（顺带拆 NoSSR，故本批不做 API 信封）· 范围收窄为 6 条
- **上一批 P2-CLEANUP done ✅** — 5/5 PASS，已上线且用户线上验收通过

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
