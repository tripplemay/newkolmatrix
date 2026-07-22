---
name: project-status
description: 项目当前状态快照（覆盖写，≤30 行）— 当前批次、计划、决策、遗留问题
type: project
---
## 当前批次
- **M1-B-BRIEF building 🔨（2026-07-22 起）· 快车道** — 6 features 全 generator；spec `docs/specs/M1-B-BRIEF-spec.md`（换会话=会话搬家，非角色分布；verifying 走隔离 evaluator subagent）
- **定位：** M1 纵线页面层。价值=验证 mock→真数据契约层能否平滑换 + 修 brief 真 bug + 补守卫前端半边（非内容丰富化——接真数据反而更红/更空）
- **范围（D1 收窄）：** F001 详情页 RSC 直读+health 真算 · F002 brief 分流 bug · F003 compute_health 工具 · F004 页面守卫前端半边 · F005 三重收敛 · F006 image/ 死代码删除。列表页/今天页顺延 M1-C
- **四裁决：** 范围收窄 · 接受 health 全红（不掩盖不打补丁）· brief 机械分流（xg 真数据其余优雅降级） · 未解锁环节可点+toast 拦截
- **上一批 M1-A-BRIEF done ✅ 并已上线** — 6/6 PASS，生产 @ `fa52f861`

## M1-B 须知（记录在案的预期，验收勿误判）
- **health 接真后四项目全 `cr`**（D2/D15）：分子（曝光/消耗）无存处，M2/M3 后消解，不得改算法掩盖。过渡态：列表页 mock vs 详情页真值不一致，M1-C 消解
- **RSC 直连 DB 页面无法 route-mock**：F001 须给 CI visual job 起 pgvector service（否则硬红，D7）
- **architecture §12.6.3/§5.3/§14 M0.5 口径滞后于 as-built** → signoff S1 建议本批顺手校准

## 已上线
- `https://newkol.guangai.ai` 现跑 **M1-A 版 @ `fa52f8619b2277e578d3a6e1bbd5b77a5bd062ad`**（2026-07-22，healthy+SSR 实测确证）。回滚=deploy-prod 填 `0c36fc2f24395be5bbf9af60a0cf4342dde057be`
- ⚠️ **image_tag 必须完整 40 位 SHA**（短 SHA pull 失败）；**部署 SHA≠HEAD**——纯文档/状态 commit 命中 build-push paths-ignore 不构建镜像，须部署最后一个含代码的已构建 SHA

## 演进路线（architecture.md v1.2 §14）
- M0 ✅ → M0.5 ✅ → **M1-A ✅ → M1-B 🔨 → M1-C（列表/今天页/knowledge/例程）** → M2 MATCH → M3 REACH/DELIVERY → M4 INSIGHT → M5 硬化

## 需求池 / 待人类
- **BL-FE-17**（Avatar showBorder）本批 F006 删 image/ 处置；**BL-FE-16**（useColorMode）暴露面零，仅登记不做
- `framework/proposed-learnings.md`：P2-CLEANUP 4 条 + harness-fit 9 条长期挂起（M1-A 3 条已 Accept 沉淀 v1.0.8）

## 关键技术坑（framework v1.0.8）
- UI 实测一律 standalone 不走 next dev · 基线重生用 `--update-snapshots=all` 断言用紧阈值 · 视觉/探针的「代理判据」随架构变更静默失效（改前 grep 全部代理点）· `git add -A` 易把生成产物扫进库 · 部署须先起 standalone 实测

## 已知下游（不在当前）
- `api/envelope.ts` 信封 · OperationLog append-only 触发器（R14）· 闸门并发原子防护（R15）· 真实认证/RLS（M5）
