---
name: project-status
description: 项目当前状态快照（覆盖写，≤30 行）— 当前批次、计划、决策、遗留问题
type: project
---
## 当前批次
- **M3-A-REACH-CRM building 0/10（spec lock 2026-07-23，快车道）** — 触达域立真：四表迁移+闸门两步票据 7 态+Resend 真投递（复用旧项目配置，kolquest.com verified 已核证）+crmInfer 五态推断+V6 接真+有限人工覆盖。真发仅测试邮箱（P1）；下批 M3-B-DELIVERY。spec `docs/specs/M3-A-REACH-CRM-spec.md`
- **M2-C-AGENT-HONESTY done ✅（2026-07-23）· 快车道 · 5/5 PASS（fix_rounds=1）** — 用户实证幻觉编排事故（对话「创建项目」零落库 + 杜撰 6 专家）三层根因逐条消解：createProject 服务 + create_project 工具（orchestrator/strategy）+ POST /api/projects + 列表页「新建项目」入口；BASE_SYSTEM 行动承诺诚实条款三条 + NO_TOOL_CLAUSE 常量化；编队名册注入（PERSONA_SEED 同源禁杜撰）；端到端闭环集成测。L2 实证：真对话已明说「还不支持」+ 指路名册内专家，杜撰角色未再现。signoff `docs/test-reports/M2C-agent-honesty-signoff-2026-07-23.md`
- **M0→M2-B 均 done ✅**

## 已上线
- `https://newkol.guangai.ai` 现跑 **M2-C 版 @ `42bacb3dda7aebfdd71bc4a859987d7d2a9ee717`**（2026-07-23 部署，四项验证过：health / campaigns「新建项目」入口在场 / POST /api/projects 活性 400 明示 / 镜像 SHA 精确对齐）。回滚=deploy-prod 填 `7cebb524281de2613b43aaaad626610ae4f447f1`
- ⚠️ image_tag 必须完整 40 位 SHA；部署 SHA≠HEAD；compose 是 VPS 人工副本
- **观察项：prod kol-sync 首跑 03:00**（预期拉入 apify-kol 存量 8800+ 行）——首跑后核 `docker logs newkolmatrix-app | grep kol-sync`

## 演进路线（architecture.md §14）
- M0→M2-C 全 ✅ → **M3 REACH/DELIVERY（CRM 事件推断+信号接入+真邮件/资金状态机+闸门 7 态）** → M4 INSIGHT → M5 硬化（含受众分布三键/brandSafety 真源 + R7 备份）

## 需求池 / 待人类
- backlog：仅 BL-FE-16（搁置）
- soft-watch（下批顺手清）：derive.ts:195 三因子枚举未随五因子更新；kol-deep.test.ts 两处旧权重注释；M2-C S1-S3（createProject name 无 .trim / workbench.spec.ts 本地跑法注释 / prose 计数误差判据）见 signoff
- proposed-learnings：清零（harness-fit 长期挂起除外）
- 遗留归位：价格数据→M3 CRM · 洞察徽标→M4 · 受众分布三键/brandSafety 真源→M5 · apify-kol 上游债（GET /kol X 枚举缺口，另仓不越界）

## 关键技术坑（v1.0.11 + 新证）
- RSC 直读必 force-dynamic · 视觉意图变更必重生基线 · 重生前必查 :3000 残活（§4.5）· 集成测试夹具租户必独立 · 带 lazy 组装层前必先建组（零 plans 触发 P2 lazy 回落真网关）· 本机真凭据跑 test:visual 必伪造 AIGCGATEWAY_* 否则 match 空态用例超时
