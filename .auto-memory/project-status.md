---
name: project-status
description: 项目当前状态快照（覆盖写，≤30 行）— 当前批次、计划、决策、遗留问题
type: project
---
## 当前批次
- **M2-A-MATCH building 0/9（2026-07-22 立项）· 快车道** — match 域纵切：三表 + matchScore 纯函数 + 候选/组合规则化生成 + 矩阵/待裁定接真 + 批准 internal 解锁 →reach（S10 消解）+ nightly-screen（scheduler 注册表化）+ match 工具/canvas ADR-28/uiSyntax 注入 + 侧栏徽标接真（U4）+ SW-R1 退役/OBS-1 收尾。spec `docs/specs/M2-A-MATCH-spec.md`
- **四裁决：** U1 compose learning 沉淀 v1.0.10 ✅ / U2 纵切先行（抽屉七分区+Kol 深字段数据源留 M2-B）/ U3 SW-R1 退役 / U4 徽标纳入
- **M1 全域 done ✅**（A 地基/B 详情页/C 列表今天+例程/D knowledge 域，6/6 PASS fix_rounds=0；M1-D 含 OBS-6 探针补账 5/6 PASS，f007 FAIL=SW-R1 既有债非回归）

## 已上线
- `https://newkol.guangai.ai` 现跑 **M1-D 版 @ `ecde6cdfabc7cae570ace4006d6af7a307457110`**（2026-07-22 部署，health+knowledge SSR+materials 卷+env 四项验证过）。回滚=deploy-prod 填 `8438dab1a07eced2e211dfebd07da7f43df9c701`
- ⚠️ **image_tag 必须完整 40 位 SHA**；**部署 SHA≠HEAD**——状态/文档 commit 不构建镜像
- ⚠️ **compose 是 VPS 人工副本**：凡改 docker-compose.prod.yml 的批次，deploy 前必须先 scp 同步（M1-D 已同步，旧版留 `.bak-m1c`）

## 演进路线（architecture.md §14）
- M0 ✅ → M0.5 ✅ → M1 ✅（A/B/C/D 四批）→ **M2-A MATCH 纵切（进行中）→ M2-B（抽屉接真+深字段数据源）** → M3 REACH/DELIVERY → M4 INSIGHT → M5 硬化（含 R7 备份=pgdata+materials 双卷）

## 需求池 / 待人类
- backlog：仅 BL-FE-16（暴露面零，登记不做）
- `framework/proposed-learnings.md`：**清零**（v1.0.10 沉淀完成）+ harness-fit 9 条长期挂起
- 遗留归位：OBS-1（→M2-A F009）· SW-R1（→M2-A F009 退役）· D-B 徽标（→M2-A F008）· S10（→M2-A F004）· prod 例程 02:00 首跑观察（延续）· M2-B 待裁决=Kol 深字段数据源（AI 估算 vs 外部采集）

## 关键技术坑（v1.0.9 + 本批新证）
- RSC 直读必 force-dynamic · CI watch 必 --workflow 过滤 · 视觉意图变更必重生基线（§4.4 首推红=预期）· 本地重生基线前清 Material/GameKnowledge（D-H 扩展）· strictNullChecks:false 下联合收窄须 `x.ok === false` 显式判别
