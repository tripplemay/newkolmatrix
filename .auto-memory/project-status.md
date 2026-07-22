---
name: project-status
description: 项目当前状态快照（覆盖写，≤30 行）— 当前批次、计划、决策、遗留问题
type: project
---
## 当前批次
- **M1-D-KNOWLEDGE done ✅（2026-07-22）· 快车道 · /goal 授权全程推进** — 首轮 fan-out 验收 6/6 PASS（fix_rounds=0，对抗复核零触发）；signoff `docs/test-reports/M1-D-KNOWLEDGE-signoff-2026-07-22.md`
- **已交付：** Material/GameKnowledge 两表 + zod 契约 · 上传 API（本地盘卷 U2，白名单/20MB/小图拒 P5/限流 P8）· 解析管道（文本 chat + 图片 vision，四态状态机 + supersede 链 + D20 变异测试）· knowledge 页接真 + mock 退役 · prompt ⑤层知识注入（strategy/match/reach/compliance kinds 映射）· 部署面 materials 卷
- **M1 全域完成**：M1-A 地基 → M1-B 详情页 → M1-C 列表/今天页 + 例程 → M1-D knowledge 域

## 已上线
- `https://newkol.guangai.ai` 现跑 **M1-D 版 @ `ecde6cdfabc7cae570ace4006d6af7a307457110`**（2026-07-22 部署，health+knowledge SSR+materials 卷+env 四项验证过）。回滚=deploy-prod 填 `8438dab1a07eced2e211dfebd07da7f43df9c701`
- ⚠️ **image_tag 必须完整 40 位 SHA**；**部署 SHA≠HEAD**——状态/文档 commit 不构建镜像
- ⚠️ **compose 是 VPS 人工副本**：凡改 docker-compose.prod.yml 的批次，deploy 前必须先 scp 同步（M1-D 已同步，旧版留 `.bak-m1c`）

## 演进路线（architecture.md §14）
- M0 ✅ → M0.5 ✅ → M1 ✅（A/B/C/D 四批）→ **M2 MATCH（下一批候选）** → M3 REACH/DELIVERY → M4 INSIGHT → M5 硬化（含 R7 备份=pgdata+materials 双卷）

## 需求池 / 待人类
- backlog：仅 BL-FE-16（暴露面零，登记不做）
- `framework/proposed-learnings.md`：**1 条新增待裁决**（M1-D compose 人工副本漂移坑）+ 既往 4 条已沉淀 v1.0.9 + harness-fit 9 条长期挂起
- M1-D signoff 遗留观察 6 条均不阻断：OBS-1 AI SDK image part 弃用告警（建议迁 type:'file'）· OBS-6 p2/f008/f010 探针无分片证据待 Planner 裁决 · prod 例程 02:00 首跑观察（M1-C 延续）

## 关键技术坑（v1.0.9 + 本批新证）
- RSC 直读必 force-dynamic · CI watch 必 --workflow 过滤 · 视觉意图变更必重生基线（§4.4 首推红=预期）· 本地重生基线前清 Material/GameKnowledge（D-H 扩展）· strictNullChecks:false 下联合收窄须 `x.ok === false` 显式判别
